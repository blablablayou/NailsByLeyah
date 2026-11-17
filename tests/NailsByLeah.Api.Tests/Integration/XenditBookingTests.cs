using System.Net;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>Pressing Pay with Payments:Provider=Xendit: the slot is held and the client is sent to Xendit's page.</summary>
public sealed class XenditBookingTests(XenditApiFactory factory) : IClassFixture<XenditApiFactory>
{
    [Fact]
    public async Task One_client_can_hold_two_times_at_once_but_not_a_third()
    {
        var user = await factory.CreateClientAsync();
        await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()));
        await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()));

        var third = await user.Client.PostJsonAsync("/api/bookings", TestHelpers.NewBooking(factory.NextSlot()));

        await third.ShouldHaveStatus(HttpStatusCode.Conflict);
        Assert.Equal("too_many_holds", (await third.ReadProblemAsync()).ProblemCode());
        // Another client isn't affected.
        var other = await factory.CreateClientAsync();
        await other.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()));
    }

    [Fact]
    public async Task A_hold_that_ran_out_no_longer_counts()
    {
        var user = await factory.CreateClientAsync();
        var first = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()));
        await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()));
        factory.WithDb(db =>
        {
            db.Bookings.Single(b => b.Id == first.Booking.Id).PaymentHoldUntil = factory.Clock.GetUtcNow().UtcDateTime.AddMinutes(-1);
            return db.SaveChanges();
        });

        await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()));
    }

    [Fact]
    public async Task Paying_creates_a_hold_and_returns_the_checkout_address()
    {
        var user = await factory.CreateClientAsync();
        var request = TestHelpers.NewBooking(factory.NextSlot()) with { PaymentMethod = PaymentMethod.Maya };

        var response = await user.Client.PostJsonAsync("/api/bookings", request);

        await response.ShouldHaveStatus(HttpStatusCode.Created);
        var result = await response.ReadAsync<CreateBookingResponse>();
        var sent = factory.Checkout.Requests.Single(r => r.BookingId == result.Booking.Id);
        Assert.Equal("AwaitingPayment", result.Booking.Status);
        Assert.Null(result.Receipt);
        Assert.Equal($"https://checkout.test/{factory.WithDb(db => db.Bookings.Single(b => b.Id == result.Booking.Id).CheckoutSessionId)}", result.CheckoutUrl);
        Assert.Equal(result.CheckoutUrl, result.Booking.CheckoutUrl);
        Assert.Equal(150m, sent.Amount);
        Assert.Equal(PaymentMethod.Maya, sent.Method);
        Assert.Equal($"booking-{result.Booking.Id}", sent.Reference);
        Assert.Equal(factory.Clock.GetUtcNow().UtcDateTime.AddMinutes(15), sent.ExpiresAtUtc);
        Assert.Equal($"https://site.test/bookings/payment?booking={result.Booking.Id}", sent.SuccessUrl);
        Assert.False(factory.WithDb(db => db.Payments.Any(p => p.BookingId == result.Booking.Id)));
        Assert.False(factory.WithDb(db => db.BookingDrafts.Any(d => d.ClientId == user.Id)));
        Assert.DoesNotContain(result.Booking.Id, factory.Notifications.ConfirmedBookingIds);
        Assert.DoesNotContain(result.Booking.Id, factory.Notifications.SalonNewBookingIds);
    }

    [Fact]
    public async Task A_repeated_pay_click_returns_the_same_hold()
    {
        var user = await factory.CreateClientAsync();
        var request = TestHelpers.NewBooking(factory.NextSlot());

        var first = await user.Client.BookAsync(request);
        var again = await user.Client.PostJsonAsync("/api/bookings", request);

        await again.ShouldHaveStatus(HttpStatusCode.OK);
        var second = await again.ReadAsync<CreateBookingResponse>();
        Assert.Equal(first.Booking.Id, second.Booking.Id);
        Assert.Equal(first.CheckoutUrl, second.CheckoutUrl);
        Assert.Equal(1, factory.Checkout.CreatedFor(first.Booking.Id));
        Assert.Equal(1, factory.WithDb(db => db.Bookings.Count(b => b.PaymentIdempotencyKey == request.IdempotencyKey)));
    }

    [Fact]
    public async Task If_Xendit_fails_the_slot_is_freed_and_the_client_is_told()
    {
        var user = await factory.CreateClientAsync();
        var slot = factory.NextSlot();
        factory.Checkout.FailNext();

        var response = await user.Client.PostJsonAsync("/api/bookings", TestHelpers.NewBooking(slot));

        Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode);
        var problem = await response.ReadProblemAsync();
        Assert.Equal("payment_unavailable", problem.ProblemCode());
        Assert.Equal("The payment couldn't be started. You have not been charged. Please try again.", problem.GetProperty("detail").GetString());
        var held = factory.WithDb(db => db.Bookings.Where(b => b.ClientId == user.Id)
            .Select(b => new { b.Status, Reason = b.Cancellation!.Reason }).Single());
        Assert.Equal((BookingStatus.Cancelled, "PaymentNotCompleted"), (held.Status, held.Reason));

        var other = await factory.CreateClientAsync();
        await other.Client.BookAsync(TestHelpers.NewBooking(slot)); // the slot is free again
    }
}

public sealed class XenditBookingRepeatTests(XenditApiFactory factory) : IClassFixture<XenditApiFactory>
{
    [Fact]
    public async Task Paying_again_with_the_same_click_after_Xendit_failed_is_told_to_try_again()
    {
        var user = await factory.CreateClientAsync();
        var request = TestHelpers.NewBooking(factory.NextSlot());
        factory.Checkout.FailNext();
        await user.Client.PostJsonAsync("/api/bookings", request);

        var again = await user.Client.PostJsonAsync("/api/bookings", request);

        Assert.Equal(HttpStatusCode.BadGateway, again.StatusCode); // never a 200 without a receipt or a page
        Assert.Equal("payment_unavailable", (await again.ReadProblemAsync()).ProblemCode());
    }

    [Fact]
    public async Task A_repeat_while_the_payment_page_is_still_opening_asks_to_wait()
    {
        var (id, _, user, request) = await factory.HoldAsync();
        factory.WithDb(db =>
        {
            var b = db.Bookings.Single(x => x.Id == id);
            b.CheckoutUrl = null;
            b.CheckoutSessionId = null;
            return db.SaveChanges();
        });

        var again = await user.Client.PostJsonAsync("/api/bookings", request);

        await again.ShouldHaveStatus(HttpStatusCode.Conflict);
        Assert.Equal("payment_starting", (await again.ReadProblemAsync()).ProblemCode());
    }
}

/// <summary>The simulated provider is unchanged: one step, receipt straight away.</summary>
public sealed class SimulatedBookingStillOneStepTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task Simulated_provider_still_books_in_one_step()
    {
        var user = await factory.CreateClientAsync();

        var result = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()));

        Assert.Equal("Pending", result.Booking.Status);
        Assert.NotNull(result.Receipt);
        Assert.Null(result.CheckoutUrl);
        Assert.Empty(factory.Checkout.Requests);
    }
}
