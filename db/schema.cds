  namespace indorama.etravel;

  using { cuid, managed } from '@sap/cds/common';

  /**
   * PRIMARY INFORMATION
   * Mirrors the header block of "FT Coverpage"
   */
  entity TravelClaims : cuid, managed {
    // --- Employee / Claim Header ---
    employeeName        : String(100);
    employeeId          : String(20);   // e.g. EMP-001
    sfid                : String(20);   // SFID from coverpage
    employeeDesignation : String(60);
    costCenter          : String(20);
    expenseCategory      : String(60);  // e.g. "CAPEX Business Travel"
    supervisorName        : String(100);
    supervisorEmail       : String(150);
    vpFinanceEmail        : String(150);
    supervisorDesignation : String(60);
    bpaInstanceId : String(100); // BPA workflow instance ID — used to route Approve/Reject back to BPA
    requestNumber    : String(30);   // shown as "Travel Request Number" in dashboard table
    employeeEmail    : String(150);
    company          : String(100);
    vertical         : String(50);
    businessArea     : String(50);
    status : String(20) default 'DRAFT'; // DRAFT, SUBMITTED, SUPERVISOR_APPROVED, VP_APPROVED, REJECTED, RETURNED, PAID

    claimDate           : Date;
    claimPeriod         : String(20);   // e.g. "September 2026"
    extensionNo         : String(20);
    paidTo              : String(60);   // e.g. "Self"
    paidToCode          : String(20);   // e.g. "4340" reference code on the form
    headerCurrency      : String(3) default 'THB';
    headerFxRate        : Decimal(10,4); // e.g. 2.40 (INR per THB)
    claimNumber         : String(30);    // auto-generated on submit, e.g. EC-2026-0001
    submittedBy         : String(100);
    declarationConfirmed : Boolean default false;
    approvalRoute       : String(60) default 'Supervisor -> Finance';

    // --- Travel Destination & Schedule ---
    travelDestinationCity    : String(60);
    travelDestinationCountry : String(60);
    tripScheduleFrom          : Date;   // Full Trip Schedule - From
    tripScheduleTo            : Date;   // Full Trip Schedule - To
    projectCode               : String(30); // AUC Code

    travelFrom            : String(60);
    travelTo              : String(60);
    departureDateTime     : DateTime;
    arrivalDateTime       : DateTime;
    numberOfDaysTravel    : Integer;
    purposeOfTravel       : String(200);

    // --- Rolled-up amounts (for quick reference / review step) ---
    hotelAmount           : Decimal(15,2);
    dailyAllowanceAmount  : Decimal(15,2);
    airTicketAmount       : Decimal(15,2);
    visaReEntryAmount     : Decimal(15,2);

    totalTHB              : Decimal(15,2) default 0;
    totalINR              : Decimal(15,2) default 0;
    attachmentsCount      : Integer default 0;

    // --- Approval status ---
    supervisorApprovalStatus : String(20) default 'Pending Approval';
    financeApprovalStatus     : String(20) default 'Pending';

    // Section A (reimbursed to self) vs Section B (paid to others) totals
    totalSectionA_THB    : Decimal(15,2) default 0;
    totalSectionA_INR    : Decimal(15,2) default 0;
    totalSectionB_THB    : Decimal(15,2) default 0;
    totalSectionB_INR    : Decimal(15,2) default 0;
    toBeReimbursedA       : Decimal(15,2) default 0;
    toBeReimbursedB       : Decimal(15,2) default 0;
    toReimburseSelfTotal  : Decimal(15,2) default 0;
    toBePaidToOthersB     : Decimal(15,2) default 0;
    grandTotal             : Decimal(15,2) default 0;

    // Sign-off block
    employeeSignedOn      : DateTime;
    accountsCheckedBy      : String(100);
    accountsCheckedOn      : DateTime;

    // For Office Use Only (not filled by employee)
    dateOfPayment  : Date;
    voucherNo       : String(30);
    companyName     : String(100);

    // --- Advance details (from Primary Information block) ---
    advanceConfirmation          : Boolean;
    advanceCurrency               : String(3);
    advanceAmount                 : Decimal(15,2);
    advanceAmountLocalCurrency    : Decimal(15,2); // "Adv. Amt. Conv. in Local Curr."
    advanceRefundConfirmation     : Boolean;
    advanceRefundedAmount         : Decimal(15,2);
    leftoverAdvanceAmount         : Decimal(15,2) default 0; // = advanceAmount - advanceRefundedAmount

    // --- Totals (PART - 4, Total Claim Summary) ---
    totalExpensesClaimed : Decimal(15,2) default 0; // Part1 + Part2 + Part3
    totalClaimAmount     : Decimal(15,2) default 0;
    remark                : String(500);

    // Approval / workflow status, driven by BPA
    supervisorApprovedBy : String(100);lastActionBy : String(150); // who most recently touched this claim (submitter/approver) — separate from the framework's own `modifiedBy`, which always shows the technical login user
    supervisorApprovedOn : DateTime;
    vpFinanceApprovedBy  : String(100);
    vpFinanceApprovedOn  : DateTime;

    // --- Associations to child parts ---
    dailyAllowances : Composition of many DailyAllowances on dailyAllowances.claim = $self;
    hotelExpenses   : Composition of many HotelExpenses   on hotelExpenses.claim   = $self;
    expenseItems    : Composition of many ExpenseItems    on expenseItems.claim    = $self;
    routing         : Composition of one  TravelRoutings  on routing.claim         = $self;
    advanceRequest  : Composition of one  TravelAdvances  on advanceRequest.claim  = $self;
  }

  /**
   * PART - 1: DAILY ALLOWANCE
   * One row per leg / destination of the trip
   */
  entity DailyAllowances : cuid {
    claim               : Association to TravelClaims;
    origin               : String(60);
    originDate           : Date;
    originTime           : Time;
    destination           : String(60);
    reachingDate         : Date;
    reachingTime         : Time;
    departureDate        : Date;   // departure FROM this destination (to next leg)
    departureTime        : Time;
    totalDays            : Decimal(5,2); // supports half-days e.g. 0.50
    designationBand      : String(40);   // SVP and Above / Vice President / JVP and AVP / MGR and Below
    dailyPerDiemRate     : Decimal(10,2);
    currency              : String(3);
    fxRate               : Decimal(10,4);
    amount                : Decimal(15,2); // totalDays * dailyPerDiemRate
    amountTHB             : Decimal(15,2); // amount * fxRate
    attachmentRef         : String(255);
  }

  /**
   * PART - 2: HOTEL EXPENSES
   */
  entity HotelExpenses : cuid {
    claim              : Association to TravelClaims;
    lineNo              : Integer;
    hotelName            : String(100);
    checkInDate          : Date;
    checkOutDate         : Date;
    totalStayDays        : Integer;
    transactionType      : String(20); // Cash / Credit Card
    roomRatePerDay       : Decimal(15,2);
    currency              : String(3);
    totalBillAmount      : Decimal(15,2); // roomRatePerDay * totalStayDays
    otherHotelExpenses   : Decimal(15,2); // Other Hotel Exps / Hotel Service
    totalHotelExpenses   : Decimal(15,2); // totalBillAmount + otherHotelExpenses
    fxRate               : Decimal(10,4);
    totalTHB             : Decimal(15,2); // totalHotelExpenses * fxRate
    // Region drives the policy rate-per-day limit, together with the claim's employeeDesignation.
    // Values: 'EuropeExclFLPL', 'FrankfurtLondonParisLuxemburg', 'HKSingaporeTokyoNY', 'RestOfCountries'
    region               : String(40);
    requiresCFOApproval  : Boolean default false; // set true when exceeds policy limit
    attachmentRef        : String(255);
  }

  /**
   * PART - 3: OTHER EXPENSES AT TRAVEL
   * Also covers the Monthly Expenses Summary categories
   * (Foreign Travel, Entertainment, Conveyance, Vehicle Parking & Toll, etc.)
   */
  entity ExpenseItems : cuid {
    claim           : Association to TravelClaims;
    lineNo           : Integer;
    section           : String(1) default 'A'; // 'A' = reimbursed to self, 'B' = paid to others
    category          : String(40); // Air Ticket, Visa Exps, Re-entry Exps, Airport Tax,
                                      // Conveyance (Taxi/Transport), Telephone (Intl roaming),
                                      // Food & Beverage, Covid/Medical Test, Others, etc.
    claimPeriodMonth  : String(20);   // 'Period' column on the Monthly form
    claimYear          : Integer;      // 'Year' column
    expenseDate      : Date;
    description       : String(200);
    units             : Decimal(10,2);
    rate              : Decimal(15,2);
    currency           : String(3);   // BHD, GBP, EUR, JPY, SGD, RUB, etc.
    fxRate            : Decimal(10,4);   // manual entry from CC statement; auto-pulled from BOT for cash txns
    amountForeign     : Decimal(15,2);
    amountTHB         : Decimal(15,2);   // = amountForeign * fxRate
    thbAmount         : Decimal(15,2);   // mockup's THB column (base currency amount)
    inrAmount          : Decimal(15,2);  // mockup's INR column = thbAmount * claim.headerFxRate
    ueFxRate           : Decimal(10,4);  // explicit "U/E" (Unit Exchange) column from the Monthly form
    paidTo              : String(60);    // per-line "To be paid to" if different from claim header
    isCashTransaction : Boolean default false;
    requiresCFOApproval : Boolean default false;
    attachmentRef     : String(255);
  }

  /**
   * FT Routing (@FT_A) — Travel Routing Authorization
   */
  entity TravelRoutings : cuid {
    claim            : Association to TravelClaims;
    employeeName      : String(100);
    position           : String(60);
    departureDate      : Date;
    departureFrom      : String(10); // airport/city code
    departureTo        : String(10);
    arrivalDate         : Date;
    arrivalFrom         : String(10);
    arrivalTo           : String(10);
    airlineName        : String(60);
    classOfTravel      : String(20); // Economy, Business, First
    approvedBy          : String(100);
    approvedOn          : DateTime;
  }

  /**
   * FT_B — Travel Advance & Tour Programme & Request for Advance
   */
 entity TravelAdvances : cuid {
  claim                   : Association to TravelClaims;
  requestNumber            : String(30);   // e.g. "AR-2026-0001"
  status                   : String(20) default 'DRAFT'; // DRAFT, SUBMITTED, APPROVED, REJECTED
  bpaInstanceId             : String(100);  // BPA workflow instance ID, set once submitAdvanceRequest starts the process
  employeeEmail            : String(150);
  approverEmail            : String(150);
  approvedOn               : DateTime;
  requestDate              : Date;
  employeeName             : String(100);
  extensionNo               : String(20);
  designation               : String(60);
  countriesToVisit         : String(200);
  lastTraveledToCountry   : Date;
  budgetAmount              : Decimal(15,2);
  amountAlreadySpent       : Decimal(15,2);
  advanceLyingUnadjusted   : Decimal(15,2);
  approverName              : String(100);

  tourLegs      : Composition of many TourProgrammeLegs on tourLegs.advance = $self;
  hotelEstimate    : Decimal(15,2);
  allowanceEstimate: Decimal(15,2);
  othersEstimate    : Decimal(15,2);
  totalEstimate     : Decimal(15,2);
  budgetForTrip      : Decimal(15,2);

  recommendedBy : String(100);
  approvalComment : String(500);
  approvedBy      : String(100);
}

  entity TourProgrammeLegs : cuid {
    advance             : Association to TravelAdvances;
    departureDateTime    : DateTime;
    fromLocation          : String(60);
    toLocation             : String(60);
    arrivalDateTime       : DateTime;
    numberOfDays           : Integer;
    description             : String(200);
    estimatedExpenses      : Decimal(15,2);
    advanceRequired        : Decimal(15,2);
  }