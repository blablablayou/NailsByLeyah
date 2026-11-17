using Microsoft.Extensions.Options;
using NailsByLeah.Api.Configuration;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Notifications;

namespace NailsByLeah.Api.Tests.Unit;

/// <summary>What the client is told when Leyah cancels or moves their appointment, or sends their refund.</summary>
public sealed class ClientSalonActionEmailTests
{
    [Fact]
    public async Task A_cancellation_by_the_salon_tells_the_client_why_and_what_comes_back()
    {
        var sent = new CapturingEmailSender();
        var booking = SampleBooking(amountPaid: 300m, refundDue: 300m);

        await Service(sent).SendBookingCancelledBySalonAsync(booking, "Leyah is not available", "Leyah is sick today.");

        var mail = Assert.Single(sent.Mails);
        Assert.Equal("kyla@example.test", mail.To);
        Assert.Contains("was cancelled", mail.Subject);
        Assert.Contains("Thursday, November 12, 2026", mail.Body);
        Assert.Contains("2:00 PM", mail.Body);
        Assert.Contains("Leyah is not available", mail.Body);
        Assert.Contains("Leyah is sick today.", mail.Body);
        Assert.Contains("PHP 300.00 will be sent back to the GCash account you paid from", mail.Body);
        Assert.DoesNotContain("Xendit", mail.Body);
    }

    [Fact]
    public async Task With_nothing_to_refund_the_email_says_the_deposit_is_kept_and_skips_a_missing_explanation()
    {
        var sent = new CapturingEmailSender();

        await Service(sent).SendBookingCancelledBySalonAsync(SampleBooking(amountPaid: 150m, refundDue: 0m), "Client did not respond", null);

        var body = Assert.Single(sent.Mails).Body;
        Assert.Contains("The PHP 150.00 deposit is kept", body);
        Assert.DoesNotContain("will be sent back", body);
        Assert.DoesNotContain("Leyah's note", body);
    }

    [Fact]
    public async Task A_move_by_the_salon_gives_the_old_and_the_new_time()
    {
        var sent = new CapturingEmailSender();

        await Service(sent).SendBookingMovedBySalonAsync(SampleBooking(), new DateOnly(2026, 11, 10), new TimeOnly(11, 0));

        var mail = Assert.Single(sent.Mails);
        Assert.Contains("was moved", mail.Subject);
        Assert.Contains("Tuesday, November 10, 2026 at 11:00 AM", mail.Body);
        Assert.Contains("Thursday, November 12, 2026 at 2:00 PM", mail.Body);
    }

    [Fact]
    public async Task A_refund_sent_by_hand_gives_the_amount_and_the_reference()
    {
        var sent = new CapturingEmailSender();
        var booking = SampleBooking(amountPaid: 300m, refundDue: 150m);
        booking.RefundSentAt = new DateTime(2026, 11, 13, 2, 0, 0, DateTimeKind.Utc);
        booking.RefundReference = "GC-REFUND-1";

        await Service(sent).SendRefundSentAsync(booking);

        var mail = Assert.Single(sent.Mails);
        Assert.Contains("refund was sent", mail.Subject);
        Assert.Contains("PHP 150.00", mail.Body);
        Assert.Contains("GC-REFUND-1", mail.Body);
        Assert.Contains("by GCash or Maya", mail.Body);
    }

    [Fact]
    public async Task A_refund_sent_online_says_it_went_back_to_their_account_and_never_names_the_payment_service()
    {
        var sent = new CapturingEmailSender();
        var booking = SampleBooking(amountPaid: 300m, refundDue: 300m);
        booking.RefundStatus = OnlineRefundStatus.Succeeded;
        booking.RefundReference = "rfd-123";
        booking.Payments = [new Payment { Method = PaymentMethod.Maya, Status = PaymentStatus.Succeeded, ReferenceNumber = "py-1", Amount = 300m }];

        await Service(sent).SendRefundSentAsync(booking);

        var body = Assert.Single(sent.Mails).Body;
        Assert.Contains("PHP 300.00 was sent back to the Maya account you paid from", body);
        Assert.DoesNotContain("Xendit", body);
        Assert.DoesNotContain("rfd-123", body); // the payment service's own id means nothing to the client
    }

    [Fact]
    public async Task A_refund_back_to_two_wallets_names_both()
    {
        var sent = new CapturingEmailSender();
        var booking = SampleBooking(amountPaid: 400m, refundDue: 400m);
        booking.RefundStatus = OnlineRefundStatus.Succeeded;
        booking.Payments =
        [
            new Payment { Method = PaymentMethod.GCash, Status = PaymentStatus.Succeeded, ReferenceNumber = "py-dep", Amount = 150m },
            new Payment { Method = PaymentMethod.Maya, Status = PaymentStatus.Succeeded, ReferenceNumber = "py-bal", Amount = 250m, Option = PaymentOption.Balance },
        ];

        await Service(sent).SendRefundSentAsync(booking);

        Assert.Contains("PHP 400.00 was sent back to the GCash and Maya accounts you paid from", Assert.Single(sent.Mails).Body);
    }

    private static EmailNotificationService Service(IEmailSender sender) => new(
        sender,
        Options.Create(new AuthOptions()),
        Options.Create(new NotificationOptions()),
        Options.Create(new FrontendOptions { BaseUrl = "https://nails.example.test/" }));

    private static Booking SampleBooking(decimal amountPaid = 150m, decimal refundDue = 0m) => new()
    {
        Id = 7,
        Client = new User { FirstName = "Kyla", LastName = "Santos", Username = "kyla", Email = "kyla@example.test", PhoneNumber = "09171234567" },
        Service = new SoftGelService { Name = "With Design", Price = 400m },
        ServicePrice = 400m,
        DepositAmount = 150m,
        AmountPaid = amountPaid,
        RefundDue = refundDue,
        BookingDate = new DateOnly(2026, 11, 12),
        StartTime = new TimeOnly(14, 0),
        DurationMinutes = 90,
        Payments = [new Payment { Method = PaymentMethod.GCash, Status = PaymentStatus.Succeeded, ReferenceNumber = "GC-1", Amount = amountPaid }],
    };

    private sealed record Mail(string To, string Subject, string Body);

    private sealed class CapturingEmailSender : IEmailSender
    {
        public List<Mail> Mails { get; } = [];

        public Task SendAsync(string toAddress, string toName, string subject, string textBody, CancellationToken ct = default)
        {
            Mails.Add(new Mail(toAddress, subject, textBody));
            return Task.CompletedTask;
        }
    }
}
