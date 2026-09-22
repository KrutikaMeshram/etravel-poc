sap.ui.define([
  "sap/ui/model/json/JSONModel",
  "sap/ui/Device"
], function (JSONModel, Device) {
  "use strict";

  return {
    createDeviceModel: function () {
      var oModel = new JSONModel(Device);
      oModel.setDefaultBindingMode("OneWay");
      return oModel;
    },

    createWizardModel: function () {
      var oModel = new JSONModel(this.getBlankClaim());
      return oModel;
    },

    createAdvanceModel: function () {
  var oModel = new JSONModel(this.getBlankAdvance());
  return oModel;
},

getBlankAdvance: function () {
  return {
    requestDate: new Date().toISOString().slice(0, 10),
    employeeName: "",
    employeeEmail: "",
    extensionNo: "",
    designation: "",
    countriesToVisit: "",
    lastTraveledToCountry: null,
    budgetAmount: 0,
    amountAlreadySpent: 0,
    advanceLyingUnadjusted: 0,
    approverName: "",
    approverEmail: "",
    status: "",
    _savedId: null,
    viewMode: false,
    reviewMode: false
  };
},
    // Central place for the "blank claim" shape so onCloseWizard can reuse it too
    getBlankClaim: function () {
      return {
        // ---- Primary Information ----
        employeeName: "",
        employeeId: "",
        sfid: "",
        employeeDesignation: "",
        costCenter: "",
        expenseCategory: "",
        supervisorName: "",
        supervisorDesignation: "",
        supervisorEmail: "",
        vpFinanceEmail: "",
        travelDestinationCity: "",
        travelDestinationCountry: "",
        tripScheduleFrom: null,
        tripScheduleTo: null,
        projectCode: "",
        claimDate: null,
        claimPeriod: "",
        extensionNo: "",
        paidTo: "Self",
        headerCurrency: "THB",
        headerFxRate: null,
        advanceConfirmation: false,
        advanceCurrency: "",
        advanceAmount: 0,
        advanceAmountLocalCurrency: 0,
        advanceRefundConfirmation: false,
        advanceRefundedAmount: 0,
        leftoverAdvanceAmount: 0,

        // ---- Part 1: Daily Allowances (table rows) ----
        dailyAllowances: [],

        // ---- Part 2: Hotel Expenses (table rows) ----
        hotelExpenses: [],

        // ---- Part 3: Other Expenses (table rows) ----
        expenseItems: [],

        // ---- Part 4: Totals & Summary ----
        totalExpensesClaimed: 0,
        totalClaimAmount: 0,
        remark: "",
        declarationConfirmed: false,
        submittedBy: "",
        approvalRoute: "Supervisor -> Finance",
        claimNumber: "",
        claimStatusText: "Draft",
        submitStatusText: "Ready to Submit",
        supervisorApprovalStatus: "Pending Approval",
        financeApprovalStatus: "Pending",

        // ---- Internal bookkeeping (not sent to backend) ----
        _savedId: null,
        viewMode: false,
        reviewMode: false,
        reviewComment: ""
      };
    }
  };
});