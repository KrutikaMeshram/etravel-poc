using indorama.etravel as etravel from '../db/schema';

/**
 * TravelService
 * Exposed to the Fiori UI (Phase 3) and consumed by the
 * SAP Build Process Automation workflow (Phase 4/5)
 */
service TravelService @(path: '/travel') {

  entity TravelClaims      as projection on etravel.TravelClaims;
  entity DailyAllowances   as projection on etravel.DailyAllowances;
  entity HotelExpenses     as projection on etravel.HotelExpenses;
  entity ExpenseItems      as projection on etravel.ExpenseItems;
  entity TravelRoutings    as projection on etravel.TravelRoutings;
  entity TravelAdvances    as projection on etravel.TravelAdvances;
  entity TourProgrammeLegs as projection on etravel.TourProgrammeLegs;

  // Action the Fiori app calls when the employee hits "Submit"
  action submitClaim(claimID : UUID) returns TravelClaims;   
   // ---- Travel Advance Request actions ----
  action submitAdvanceRequest(advanceID : UUID) returns TravelAdvances;
action approveAdvance(advanceID : UUID, approver : String, comment : String) returns TravelAdvances;
action rejectAdvance(advanceID : UUID, comment : String) returns TravelAdvances;

  // Actions called by BPA's human tasks (Supervisor / VP Finance)
  action approveBySupervisor(claimID : UUID, approver : String, comment : String) returns TravelClaims;
  action approveByVPFinance(claimID : UUID, approver : String, comment : String)  returns TravelClaims;
  action rejectClaim(claimID : UUID, comment : String)           returns TravelClaims;

  // Function for Dashboard tile/counters
function getDashboardCounts() returns {
  draftCount     : Integer;
  pendingCount   : Integer;
  approvedCount  : Integer;
  completedCount : Integer;
  returnCount    : Integer;
  rejectedCount  : Integer;
  advancePendingCount  : Integer;
  advanceApprovedCount : Integer;
  advanceRejectedCount : Integer;
};
}