using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Services;

namespace NailsByLeah.Api.Tests.Unit;

/// <summary>How a refund owed is shared over the online payments: newest first, one part per payment.</summary>
public sealed class RefundPartsTests
{
    private static Booking Paid(decimal refundDue, params (string Ref, decimal Amount, int Minute)[] payments) => new()
    {
        Id = 1,
        RefundDue = refundDue,
        Payments = payments.Select((p, i) => new Payment
        {
            Id = i + 1, ReferenceNumber = p.Ref, Amount = p.Amount, Status = PaymentStatus.Succeeded,
            PaidAt = new DateTime(2026, 11, 17, 1, p.Minute, 0, DateTimeKind.Utc),
        }).ToList(),
    };

    [Fact]
    public void A_full_refund_goes_back_newest_payment_first_then_the_rest()
    {
        var booking = Paid(400m, ("py-dep", 150m, 0), ("py-bal", 250m, 30));

        var first = OnlineRefundService.NextPart(booking)!.Value;
        Assert.Equal(("py-bal", 250m), (first.Payment.ReferenceNumber, first.Amount));
        first.Payment.RefundedAmount = 250m;

        var second = OnlineRefundService.NextPart(booking)!.Value;
        Assert.Equal(("py-dep", 150m), (second.Payment.ReferenceNumber, second.Amount));
        second.Payment.RefundedAmount = 150m;

        Assert.Null(OnlineRefundService.NextPart(booking));
        Assert.Equal(400m, OnlineRefundService.RefundedOnline(booking));
    }

    [Fact]
    public void With_the_deposit_kept_only_the_balance_payment_goes_back()
    {
        var booking = Paid(250m, ("py-dep", 150m, 0), ("py-bal", 250m, 30));

        var only = OnlineRefundService.NextPart(booking)!.Value;
        only.Payment.RefundedAmount = only.Amount;

        Assert.Equal(("py-bal", 250m), (only.Payment.ReferenceNumber, only.Amount));
        Assert.Null(OnlineRefundService.NextPart(booking));
    }

    [Fact]
    public void A_single_payment_refund_is_one_part_as_before()
    {
        var booking = Paid(100m, ("py-full", 400m, 0));

        Assert.Equal(("py-full", 100m), (OnlineRefundService.NextPart(booking)!.Value.Payment.ReferenceNumber, OnlineRefundService.NextPart(booking)!.Value.Amount));
        Assert.True(OnlineRefundService.CanRefundOnline(booking));
    }

    [Fact]
    public void A_refund_larger_than_what_was_paid_online_cannot_go_back_online()
    {
        var booking = Paid(400m, ("py-dep", 150m, 0), ("GC-CASH", 250m, 30)); // the balance was paid another way

        Assert.False(OnlineRefundService.CanRefundOnline(booking));
    }
}
