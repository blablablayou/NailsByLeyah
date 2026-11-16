using NailsByLeah.Api.Errors;

namespace NailsByLeah.Api.Domain;

public class Booking : IPayable, ICancellable, ISoftDeletable
{
    public int Id { get; set; }

    public int ClientId { get; set; }
    public User Client { get; set; } = null!;

    public int ServiceId { get; set; }
    public CatalogService Service { get; set; } = null!;

    /// <summary>A removal done before the main service in the same appointment (optional).</summary>
    public int? RemovalServiceId { get; set; }
    public RemovalService? RemovalService { get; set; }

    /// <summary>Price of the removal when the booking was made; 0 without one.</summary>
    public decimal RemovalPrice { get; set; }

    /// <summary>The nail colour the client chose (from the salon's list), or null for a removal only.</summary>
    public string? NailColor { get; set; }

    /// <summary>
    /// Optional colours for each nail as JSON, {"left":[...5],"right":[...5]}, thumb first; a null nail has the main colour.
    /// Kept as one text column: it is only ever read and shown with the booking.
    /// </summary>
    public string? PerNailColors { get; set; }

    /// <summary>"Can't find your colour?": the shade the client described, when it isn't on the chart.</summary>
    public string? ColorRequest { get; set; }

    /// <summary>Whether Leyah has the requested shade; Pending until she answers. Null without a request.</summary>
    public ColorRequestStatus? ColorRequestStatus { get; set; }

    /// <summary>How many times the client moved the appointment themselves (Leyah's own moves don't count).</summary>
    public int RescheduleCount { get; set; }

    /// <summary>Clients may move an appointment this many times; after that they contact Leyah.</summary>
    public const int ClientRescheduleLimit = 2;

    /// <summary>The Terms &amp; Conditions version the client agreed to when booking, and when.</summary>
    public string? TermsVersion { get; set; }
    public DateTime? TermsAcceptedAt { get; set; }

    /// <summary>"With Design + Removal (My Work)": every service in the appointment.</summary>
    public string ServiceDescription => RemovalService is { } removal ? $"{Service.Name} + Removal ({removal.Name})" : Service.Name;

    /// <summary>Price of the main service when the booking was made (Ref 13.6).</summary>
    public decimal ServicePrice { get; set; }

    /// <summary>Deposit charged for this booking. Non-refundable.</summary>
    public decimal DepositAmount { get; set; }

    public DateOnly BookingDate { get; set; }
    public TimeOnly StartTime { get; set; }

    /// <summary>Length of the whole appointment (removal included) when the booking was made, so later duration changes don't move existing appointments.</summary>
    public int DurationMinutes { get; set; }

    /// <summary>Scheduled completion. The 30-minute gap before the next appointment starts here.</summary>
    public TimeOnly EndTime => StartTime.AddMinutes(DurationMinutes);

    /// <summary>
    /// Who the appointment is for when it isn't the account holder: a walk-in or Messenger client Leyah booked herself
    /// (the booking then sits on her own account). Shown instead of the account holder's name everywhere.
    /// </summary>
    public string? GuestName { get; set; }
    public string? GuestPhone { get; set; }

    /// <summary>Leyah made this booking from the admin side rather than the client online.</summary>
    public bool CreatedByAdmin { get; set; }

    /// <summary>What the client typed for Leyah (optional).</summary>
    public string? Note { get; set; }

    /// <summary>The note to show in emails and lists.</summary>
    public string NoteText => Note ?? Labels.NoNote;

    public BookingStatus Status { get; set; } = BookingStatus.Pending;

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? ReminderSentAt { get; set; }
    public bool IsDeleted { get; set; }

    /// <summary>Optimistic concurrency token: Postgres's own row version (the xmin system column).</summary>
    public uint RowVersion { get; set; }

    public List<BookingAddOn> AddOns { get; set; } = [];
    public List<Payment> Payments { get; set; } = [];
    public Cancellation? Cancellation { get; set; }

    /// <summary>Photos of the design the client wants (optional).</summary>
    public List<ReferenceImage> ReferenceImages { get; set; } = [];

    /// <summary>Whether the client paid the deposit or the whole total when booking.</summary>
    public PaymentOption PaymentOption { get; set; } = PaymentOption.Deposit;

    /// <summary>Verified amount paid online. The deposit is part of it; prices are those stored when the booking was made.</summary>
    public decimal AmountPaid { get; set; }

    /// <summary>The rest of the price, received by the salon after the service (not through the website).</summary>
    public decimal BalanceReceived { get; set; }
    public DateTime? BalanceReceivedAt { get; set; }

    /// <summary>The GCash reference for the balance, if the administrator entered one.</summary>
    public string? BalanceReference { get; set; }

    /// <summary>When and by whom the administrator confirmed the booking after checking its payment.</summary>
    /// <summary>
    /// What the salon owes back after a cancellation or no-show, set when it happens: everything paid when the salon
    /// cancels; otherwise everything above the deposit, which is kept (it is also the late-cancellation and no-show fee).
    /// </summary>
    public decimal RefundDue { get; set; }
    /// <summary>
    /// When the refund was sent, and its reference: Leyah's GCash or Maya reference when she sent it herself, or the
    /// provider's refund id when it went back online.
    /// </summary>
    public DateTime? RefundSentAt { get; set; }
    public string? RefundReference { get; set; }

    /// <summary>Set only for a refund sent back online through the payment provider; null when Leyah sends it herself.</summary>
    public OnlineRefundStatus? RefundStatus { get; set; }
    public DateTime? RefundRequestedAt { get; set; }

    // ---- Paying on Xendit's hosted page (Payments:Provider=Xendit) ----

    /// <summary>Until when the slot is held for the client to pay (AwaitingPayment only).</summary>
    public DateTime? PaymentHoldUntil { get; set; }

    /// <summary>Xendit's id for the latest payment session made for this booking.</summary>
    public string? CheckoutSessionId { get; set; }

    /// <summary>Xendit's page where the client pays, for "Continue payment".</summary>
    public string? CheckoutUrl { get; set; }

    /// <summary>The Pay click's idempotency key, so a repeated click returns this hold instead of making a second one.</summary>
    public Guid? PaymentIdempotencyKey { get; set; }

    /// <summary>GCash or Maya, as chosen on the payment step; the Xendit session only offers that channel.</summary>
    public PaymentMethod? PendingPaymentMethod { get; set; }

    /// <summary>A hold that was never paid: not a booking for Leyah (lists, dashboard, reports), whether still open or expired.</summary>
    public bool IsUnpaidHold => AmountPaid == 0 && PaymentIdempotencyKey != null
                                && Status is BookingStatus.AwaitingPayment or BookingStatus.Cancelled;

    /// <summary>The hold ends without a payment (ran out, the client cancelled it, or Xendit couldn't start): the slot is freed.</summary>
    public void ReleaseHold(DateTime utcNow)
    {
        if (Status != BookingStatus.AwaitingPayment)
            throw new ConflictException($"A {Status} booking is not waiting for a payment.", "invalid_status");
        Status = BookingStatus.Cancelled;
        UpdatedAt = utcNow;
    }

    /// <summary>The client is sent to Xendit: the slot is held until <paramref name="holdUntilUtc"/>.</summary>
    public void HoldForPayment(Guid idempotencyKey, PaymentMethod method, PaymentOption option, DateTime holdUntilUtc)
    {
        Status = BookingStatus.AwaitingPayment;
        PaymentIdempotencyKey = idempotencyKey;
        PendingPaymentMethod = method;
        PaymentOption = option;
        PaymentHoldUntil = holdUntilUtc;
    }

    public DateTime? ConfirmedAt { get; set; }
    public int? ConfirmedByUserId { get; set; }
    public User? ConfirmedBy { get; set; }

    public decimal TotalPrice => ServicePrice + RemovalPrice + AddOns.Sum(a => a.LinePrice);

    /// <summary>Amount still to be paid at the salon: nothing after a full payment or once the balance is received.</summary>
    public decimal BalanceDue => Math.Max(0, TotalPrice - AmountPaid - BalanceReceived);

    public DateTime StartsAtLocal => BookingDate.ToDateTime(StartTime);

    public bool IsActive => Status is BookingStatus.Pending or BookingStatus.Confirmed;

    public bool CanBeCancelled => IsActive;

    // A full payment is the total, and never less than the non-refundable deposit it includes.
    public decimal AmountFor(PaymentOption option) => option == PaymentOption.Full ? Math.Max(TotalPrice, DepositAmount) : DepositAmount;

    public void RecordPayment(PaymentOption option, decimal amount)
    {
        if (Status != BookingStatus.Pending)
            throw new ConflictException($"A {Status} booking cannot take a new payment.", "invalid_status");
        if (AmountPaid > 0)
            throw new ConflictException("This booking has already been paid.", "already_paid");
        PaymentOption = option;
        AmountPaid = amount;
    }

    /// <summary>The administrator has checked the payment and accepts the appointment.</summary>
    public void Confirm(int adminId, DateTime utcNow)
    {
        if (Status != BookingStatus.Pending)
            throw new ConflictException($"A {Status} booking cannot be confirmed.", "invalid_status");
        Status = BookingStatus.Confirmed;
        ConfirmedAt = utcNow;
        ConfirmedByUserId = adminId;
        UpdatedAt = utcNow;
    }

    /// <summary>The deposit is kept from what was paid; the rest goes back.</summary>
    public decimal AmountAboveDeposit => Math.Max(0, AmountPaid - DepositAmount);

    public void MarkCancelled(DateTime utcNow, bool fullRefund)
    {
        if (!CanBeCancelled)
            throw new ConflictException($"A {Status} booking cannot be cancelled.", "invalid_status");
        Status = BookingStatus.Cancelled;
        RefundDue = fullRefund ? AmountPaid : AmountAboveDeposit;
        UpdatedAt = utcNow;
    }

    /// <summary>Leyah sent the refund herself. Always the whole amount owed, so it can only happen once.</summary>
    public decimal RecordRefund(string? reference, DateTime utcNow)
    {
        EnsureRefundOwed();
        RefundSentAt = utcNow;
        RefundReference = reference;
        RefundStatus = null; // sent by hand, even after an online try that didn't go through
        UpdatedAt = utcNow;
        return RefundDue;
    }

    /// <summary>The refund is being sent back online. Saved before the provider is asked, so a second click can't send it twice.</summary>
    public decimal StartOnlineRefund(DateTime utcNow)
    {
        EnsureRefundOwed();
        RefundStatus = OnlineRefundStatus.Processing;
        RefundRequestedAt = utcNow;
        RefundReference = null;
        UpdatedAt = utcNow;
        return RefundDue;
    }

    /// <summary>The provider says the money went back. False when nothing changes (already done, or not this refund).</summary>
    public bool CompleteOnlineRefund(string refundId, DateTime utcNow)
    {
        if (RefundStatus != OnlineRefundStatus.Processing || !IsThisRefund(refundId))
            return false;
        RefundStatus = OnlineRefundStatus.Succeeded;
        RefundReference = refundId;
        RefundSentAt = utcNow;
        UpdatedAt = utcNow;
        return true;
    }

    /// <summary>The provider couldn't send it back. Leyah can try again or send it herself.</summary>
    public bool FailOnlineRefund(string? refundId, DateTime utcNow)
    {
        if (RefundStatus != OnlineRefundStatus.Processing || (refundId is not null && !IsThisRefund(refundId)))
            return false;
        RefundStatus = OnlineRefundStatus.Failed;
        RefundReference = null;
        UpdatedAt = utcNow;
        return true;
    }

    // The provider's id is kept as soon as it answers; before that, any refund for this booking is the one in progress.
    private bool IsThisRefund(string refundId) => RefundReference is null || RefundReference == refundId;

    private void EnsureRefundOwed()
    {
        if (RefundDue <= 0)
            throw new ConflictException("No refund is owed on this booking.", "no_refund_due");
        if (RefundSentAt is not null)
            throw new ConflictException("This refund has already been recorded.", "refund_already_sent");
        if (RefundStatus == OnlineRefundStatus.Processing)
            throw new ConflictException("This refund is already being sent back online. Wait for it to finish.", "refund_in_progress");
    }

    public void MarkCompleted(DateTime utcNow)
    {
        if (Status != BookingStatus.Confirmed)
            throw new ConflictException("Only confirmed bookings can be completed.", "invalid_status");
        Status = BookingStatus.Completed;
        UpdatedAt = utcNow;
    }

    /// <summary>The client did not come. Only possible once the appointment time has arrived.</summary>
    public void MarkNoShow(DateTime localNow, DateTime utcNow)
    {
        if (!IsActive)
            throw new ConflictException($"A {Status} booking cannot be marked as a no-show.", "invalid_status");
        if (StartsAtLocal > localNow)
            throw new ConflictException("A booking can only be marked as a no-show once its appointment time has arrived.", "invalid_status");
        Status = BookingStatus.NoShow;
        RefundDue = AmountAboveDeposit; // the deposit is the no-show fee
        UpdatedAt = utcNow;
    }

    /// <summary>The client paid the rest after the service. Always the whole balance, so it can only happen once.</summary>
    public decimal RecordBalance(string? reference, DateTime utcNow)
    {
        if (Status != BookingStatus.Completed)
            throw new ConflictException("A balance can only be recorded on a completed booking.", "invalid_status");
        var amount = BalanceDue;
        if (amount <= 0)
            throw new ConflictException("This booking has no balance left to record.", "no_balance_due");
        BalanceReceived = amount;
        BalanceReceivedAt = utcNow;
        BalanceReference = reference;
        UpdatedAt = utcNow;
        return amount;
    }

    /// <summary>Leyah checked whether she has the shade the client asked for.</summary>
    public void DecideColorRequest(bool available, DateTime utcNow)
    {
        if (ColorRequestStatus is null)
            throw new ConflictException("This booking has no colour request.", "no_color_request");
        if (!IsActive)
            throw new ConflictException($"A {Status} booking's colour request can no longer be changed.", "invalid_status");
        ColorRequestStatus = available ? Domain.ColorRequestStatus.Available : Domain.ColorRequestStatus.Unavailable;
        UpdatedAt = utcNow;
    }

    public void MoveTo(DateOnly date, TimeOnly startTime, DateTime utcNow)
    {
        if (!IsActive)
            throw new ConflictException($"A {Status} booking cannot be rescheduled.", "invalid_status");
        BookingDate = date;
        StartTime = startTime;
        ReminderSentAt = null;
        UpdatedAt = utcNow;
    }
}

public class BookingAddOn
{
    public int Id { get; set; }
    public int BookingId { get; set; }
    public Booking Booking { get; set; } = null!;

    public int AddOnId { get; set; }
    public StoneAddOn AddOn { get; set; } = null!;

    public int NailCount { get; set; }

    /// <summary>The hand the add-on goes on. Bookings made before hands were asked for are stored as Both.</summary>
    public NailHand Hand { get; set; } = NailHand.Both;

    /// <summary>Amount charged for this add-on line when the booking was made (Ref 13.6).</summary>
    public decimal LinePrice { get; set; }
}

/// <summary>
/// A booking a client started but has not paid for yet, so they can continue later (on any device). It is never an
/// appointment: it holds no time slot, and it is deleted when the booking is made. The selections are kept as the
/// client's own JSON and are checked again in full when the booking is submitted.
/// </summary>
public class BookingDraft
{
    public int Id { get; set; }
    public int ClientId { get; set; }
    public User Client { get; set; } = null!;
    public string Data { get; set; } = "{}";
    public DateTime UpdatedAt { get; set; }
}

/// <summary>A client's star rating of the salon, with an optional comment.</summary>
public class Feedback
{
    public const int MinRating = 1;
    public const int MaxRating = 5;

    public int Id { get; set; }
    public int ClientId { get; set; }
    public User Client { get; set; } = null!;
    public int Rating { get; set; }
    public string? Comment { get; set; }

    /// <summary>Sent by the browser with each submission, so a double click is saved once.</summary>
    public Guid SubmissionKey { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>Leyah's answer, shown to the client on their Feedback page.</summary>
    public string? Reply { get; set; }
    public DateTime? RepliedAt { get; set; }
}

/// <summary>A photo of Leyah's work for the home page's Our Works gallery, in the same private storage as design photos.</summary>
public class GalleryPhoto
{
    public const int MaxPhotos = 30;

    public int Id { get; set; }
    public string FileName { get; set; } = "";
    public string ContentType { get; set; } = "";
    /// <summary>A few words about the set, shown under the photo (optional).</summary>
    public string? Caption { get; set; }
    public DateTime CreatedAt { get; set; }
    public int? CreatedByUserId { get; set; }
}
