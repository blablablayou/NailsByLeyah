using System.Collections.Concurrent;
using System.Threading.Channels;

namespace NailsByLeah.Api.Notifications;

/// <summary>
/// Sends an email after the request has answered. Used where the answer must not depend on whether an account exists
/// ("forgot password", "resend code"): the reply is equally fast for every address, and an email failure is logged
/// instead of turning into an error only real accounts would see.
/// </summary>
public interface IBackgroundNotifications
{
    /// <summary>Queues <paramref name="send"/>; <paramref name="description"/> names it in the log if it fails.</summary>
    ValueTask EnqueueAsync(Func<INotificationService, CancellationToken, Task> send, string description);
}

/// <summary>
/// An in-memory queue worked through by one background loop, each email in its own service scope. A failed email is
/// tried again twice; when the app stops, what is queued is sent first.
/// </summary>
public sealed class QueuedBackgroundNotifications(IServiceScopeFactory scopes, ILogger<QueuedBackgroundNotifications> logger)
    : BackgroundService, IBackgroundNotifications
{
    /// <summary>
    /// The waits before the second and third tries. A short outage at the email provider is ridden out; an email that
    /// still fails is logged as critical, which sends the error alert.
    /// </summary>
    public IReadOnlyList<TimeSpan> RetryDelays { get; init; } = [TimeSpan.FromSeconds(30), TimeSpan.FromMinutes(2)];

    private sealed record Job(Func<INotificationService, CancellationToken, Task> Send, string Description, int Attempt);

    private readonly Channel<Job> _queue = Channel.CreateBounded<Job>(
        new BoundedChannelOptions(500) { FullMode = BoundedChannelFullMode.DropWrite, SingleReader = false }); // the loop, and StopAsync's last pass

    // Stopping: the waits before a retry end at once. Hard stop: the host's shutdown time is up, so sending ends too.
    private readonly CancellationTokenSource _stopping = new();
    private readonly CancellationTokenSource _hardStop = new();
    private readonly ConcurrentDictionary<Task, byte> _retries = new();

    public ValueTask EnqueueAsync(Func<INotificationService, CancellationToken, Task> send, string description)
    {
        // A full queue means something is badly wrong (rate limits keep it small); drop rather than slow the request.
        if (!_queue.Writer.TryWrite(new Job(send, description, 1)))
            logger.LogWarning("Email queue is full or closed; dropped the {Description}", description);
        return ValueTask.CompletedTask;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            // Not stoppingToken: when the app stops, what is already queued is still sent (see StopAsync).
            await foreach (var job in _queue.Reader.ReadAllAsync(_hardStop.Token))
                await RunAsync(job);
        }
        catch (OperationCanceledException) when (_hardStop.IsCancellationRequested)
        {
            logger.LogCritical("The server stopped before every queued email was sent");
        }
    }

    /// <summary>Waiting retries go back in the queue, nothing new is taken, and the queue is sent before the app stops.</summary>
    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        await _stopping.CancelAsync();
        await Task.WhenAll(_retries.Keys);
        _queue.Writer.TryComplete();
        await using var hardStop = cancellationToken.Register(_hardStop.Cancel);
        // Sent here too, not only by the loop: the loop may not have started yet when the app stops this early.
        try
        {
            while (!_hardStop.IsCancellationRequested && _queue.Reader.TryRead(out var job))
                await RunAsync(job);
        }
        finally
        {
            await base.StopAsync(cancellationToken); // and waits for the email the loop is sending, if any
        }
    }

    public override void Dispose()
    {
        _stopping.Dispose();
        _hardStop.Dispose();
        base.Dispose();
    }

    private async Task RunAsync(Job job)
    {
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            await job.Send(scope.ServiceProvider.GetRequiredService<INotificationService>(), _hardStop.Token);
        }
        catch (Exception ex) when (!_hardStop.IsCancellationRequested)
        {
            if (job.Attempt > RetryDelays.Count)
            {
                logger.LogCritical(ex, "Could not send the {Description} after {Attempts} tries", job.Description, job.Attempt);
                return;
            }
            logger.LogWarning(ex, "Could not send the {Description} (try {Attempt}); trying again", job.Description, job.Attempt);
            var retry = RetryLaterAsync(job with { Attempt = job.Attempt + 1 }, RetryDelays[job.Attempt - 1]);
            _retries.TryAdd(retry, 0);
            _ = retry.ContinueWith(done => _retries.TryRemove(done, out _), TaskScheduler.Default);
        }
    }

    private async Task RetryLaterAsync(Job job, TimeSpan delay)
    {
        try
        {
            await Task.Delay(delay, _stopping.Token);
        }
        catch (OperationCanceledException)
        {
            // Stopping: try it now, while the queue is still being sent.
        }
        if (!_queue.Writer.TryWrite(job))
            logger.LogCritical("Could not send the {Description}: the email queue was closed before it could be tried again", job.Description);
    }
}
