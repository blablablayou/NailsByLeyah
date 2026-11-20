namespace NailsByLeah.Api.Domain;

/// <summary>Role names used in authorization attributes. They match <see cref="UserRole"/> member names.</summary>
public static class Roles
{
    public const string Client = nameof(UserRole.Client);
    public const string Administrator = nameof(UserRole.Administrator);
}

public enum UserRole
{
    Client,
    Administrator,
}

public enum BookingStatus
{
    Pending,
    Confirmed,
    Completed,
    Cancelled,
    /// <summary>The client did not come. The time has passed, so it holds no slot; the deposit is kept.</summary>
    NoShow,
    /// <summary>
    /// The client is paying on Xendit's page: the slot is held until <see cref="Booking.PaymentHoldUntil"/>, but it is not a
    /// booking for Leyah yet. Becomes Pending once Xendit confirms the payment, or Cancelled if the hold runs out.
    /// </summary>
    AwaitingPayment,
}

public enum PaymentMethod
{
    GCash,
    Maya,
    /// <summary>Paid in person at the salon; only for bookings Leyah makes herself.</summary>
    Cash,
}

/// <summary>What the client chose to pay when booking. The deposit is part of a full payment, never charged on top.</summary>
public enum PaymentOption
{
    Deposit,
    Full,
    /// <summary>The rest of a confirmed booking, paid online before the appointment (a second payment).</summary>
    Balance,
}

public enum PaymentStatus
{
    Succeeded,
    Failed,
}

/// <summary>Reasons a client may give when canceling (Ref 2.5).</summary>
public enum ClientCancellationReason
{
    ChangeOfSchedule,
    Emergency,
    BookedByMistake,
    FoundAnotherProvider,
    Others,
}

/// <summary>Reasons an administrator may give when canceling (Ref 3.1).</summary>
public enum AdminCancellationReason
{
    StaffUnavailable,
    ScheduleConflict,
    Emergency,
    ClientDidNotRespond,
    Others,
}

/// <summary>Which hand a Stone add-on goes on. One hand has five nails, so Left or Right allows at most 5.</summary>
public enum NailHand
{
    Left,
    Right,
    Both,
}

/// <summary>A color request waits for Leyah to say whether she has the shade.</summary>
public enum ColorRequestStatus
{
    Pending,
    Available,
    Unavailable,
}

/// <summary>A refund sent back through the payment provider, to the account the client paid from.</summary>
public enum OnlineRefundStatus
{
    /// <summary>Sent to the provider; it hasn't said yet that the money arrived.</summary>
    Processing,
    Succeeded,
    /// <summary>The provider couldn't send it; Leyah can try again or send it herself.</summary>
    Failed,
}

public enum UserTokenPurpose
{
    EmailVerification,
    PasswordReset,
    /// <summary>The 6-digit code Leyah enters after her password.</summary>
    AdminLoginCode,
    /// <summary>The 6-digit code that confirms a password change from the account page.</summary>
    PasswordChangeCode,
}
