using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NailsByLeah.Api.Notifications;
using NailsByLeah.Api.Tests.Integration;

namespace NailsByLeah.Api.Tests.Unit;

/// <summary>The background email queue: a failed email is tried again, and what is queued is sent before the app stops.</summary>
public sealed class EmailQueueTests
{
    private static QueuedBackgroundNotifications NewQueue()
    {
        var services = new ServiceCollection().AddSingleton<INotificationService, CapturingNotificationService>().BuildServiceProvider();
        return new QueuedBackgroundNotifications(services.GetRequiredService<IServiceScopeFactory>(), NullLogger<QueuedBackgroundNotifications>.Instance)
        {
            RetryDelays = [TimeSpan.Zero, TimeSpan.Zero], // the real waits are 30 seconds and 2 minutes
        };
    }

    /// <summary>An email that fails <paramref name="failures"/> times, then sends; counts every try.</summary>
    private static (Func<INotificationService, CancellationToken, Task> Send, Func<int> Tries) Failing(int failures)
    {
        var tries = 0;
        return ((_, _) => Interlocked.Increment(ref tries) <= failures ? throw new InvalidOperationException("Brevo is down (test)") : Task.CompletedTask,
            () => Volatile.Read(ref tries));
    }

    private static async Task WaitUntil(Func<bool> done)
    {
        for (var i = 0; i < 200 && !done(); i++)
            await Task.Delay(10);
    }

    [Fact]
    public async Task An_email_that_fails_twice_goes_out_on_the_third_try()
    {
        using var queue = NewQueue();
        await queue.StartAsync(CancellationToken.None);
        var (send, tries) = Failing(2);

        await queue.EnqueueAsync(send, "test email");
        await WaitUntil(() => tries() == 3);
        await queue.StopAsync(CancellationToken.None);

        Assert.Equal(3, tries());
    }

    [Fact]
    public async Task An_email_that_keeps_failing_is_tried_three_times_then_given_up()
    {
        using var queue = NewQueue();
        await queue.StartAsync(CancellationToken.None);
        var (send, tries) = Failing(100);

        await queue.EnqueueAsync(send, "test email");
        await WaitUntil(() => tries() >= 3);
        await Task.Delay(100);
        await queue.StopAsync(CancellationToken.None);

        Assert.Equal(3, tries());
    }

    [Fact]
    public async Task Emails_still_queued_when_the_app_stops_are_sent_first()
    {
        using var queue = NewQueue();
        await queue.StartAsync(CancellationToken.None);
        var sent = 0;
        for (var i = 0; i < 3; i++)
            await queue.EnqueueAsync(async (_, _) => { await Task.Delay(50); Interlocked.Increment(ref sent); }, "slow email");

        await queue.StopAsync(CancellationToken.None);

        Assert.Equal(3, sent);
    }
}
