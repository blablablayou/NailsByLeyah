namespace NailsByLeah.Api.Payments;

/// <summary>Who takes the client's payment (setting Payments:Provider).</summary>
public enum PaymentProvider
{
    /// <summary>Approves every payment at once, without money moving. Development and test deployments only.</summary>
    Simulated,

    /// <summary>Xendit's hosted GCash / Maya checkout (test mode for the defense); confirmed by Xendit's webhook.</summary>
    Xendit,
}
