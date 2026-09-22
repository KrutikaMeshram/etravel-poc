sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/model/Sorter",
  "sap/m/MessageToast",
  "sap/m/MessageBox"
], function (Controller, Filter, FilterOperator, Sorter, MessageToast, MessageBox) {
  "use strict";

  // Same friendly labels/colors as the Dashboard, kept in sync
  var STATUS_LABELS = {
    DRAFT: "Draft",
    SUBMITTED: "Pending",
    SUPERVISOR_APPROVED: "Pending",
    VP_APPROVED: "Pending",
    PAID: "Completed",
    REJECTED: "Rejected",
    RETURNED: "Returned"
  };

  var STATUS_STATES = {
    Draft: "None",
    Pending: "Warning",
    Completed: "Success",
    Rejected: "Error",
    Returned: "Warning"
  };

  // Only these statuses have an actionable, open task waiting on someone.
  var PENDING_STATUSES = ["SUBMITTED", "SUPERVISOR_APPROVED"];

  // Travel Advance status labels — single-level approval, so only ever SUBMITTED here
  var ADVANCE_STATUS_LABELS = {
    SUBMITTED: "Pending",
    APPROVED: "Approved",
    REJECTED: "Rejected"
  };

  var ADVANCE_STATUS_STATES = {
    Pending: "Warning",
    Approved: "Success",
    Rejected: "Error"
  };

  return Controller.extend("etravel.travelclaims.controller.Approvals", {

    onInit: function () {
      this._applyPendingFilter();
      this._applyAdvancePendingFilter();
      sap.ui.getCore().getEventBus().subscribe("etravel", "approvalsShown", this._onApprovalsShown, this);
    },

    _onApprovalsShown: function () {
      this._refreshTable();
      this._refreshAdvanceTable();
    },

    _applyAdvancePendingFilter: function () {
      var oBinding = this.byId("advanceApprovalsTable").getBinding("items");
      if (!oBinding) return;
      oBinding.changeParameters({
        $filter: "status eq 'SUBMITTED'",
        $orderby: "requestNumber desc"
      });
    },

    _refreshAdvanceTable: function () {
      this._applyAdvancePendingFilter();
      var oBinding = this.byId("advanceApprovalsTable").getBinding("items");
      if (oBinding) oBinding.refresh();
    },

    formatAdvanceStatus: function (sStatus) {
      return ADVANCE_STATUS_LABELS[sStatus] || sStatus;
    },

    formatAdvanceStatusState: function (sStatus) {
      var sLabel = ADVANCE_STATUS_LABELS[sStatus] || sStatus;
      return ADVANCE_STATUS_STATES[sLabel] || "None";
    },

    onAdvanceRefreshPress: function () {
      this._refreshAdvanceTable();
      MessageToast.show("Advance approvals refreshed.");
    },

    onAdvanceReviewPress: async function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext();
      var oAdvance = oCtx && oCtx.getObject();
      if (!oAdvance) return;

      try {
        await this._loadAdvanceIntoWizard(oAdvance.ID);
        this.getOwnerComponent().navToAdvance();
      } catch (oErr) {
        var sMsg = (oErr && oErr.error && oErr.error.message) || "Could not load this advance.";
        MessageBox.error(sMsg);
      }
    },

    _loadAdvanceIntoWizard: async function (sAdvanceId) {
      var oAdvanceModel = this.getOwnerComponent().getModel("advance");
      var sUrl = "/travel/TravelAdvances('" + sAdvanceId + "')";

      var res = await fetch(sUrl);
      if (!res.ok) {
        throw await res.json();
      }
      var oData = await res.json();

      oData._savedId = oData.ID;
      oData.viewMode = true;
      oData.reviewMode = true; // shows Approve/Reject buttons on the Travel Advance form

      oAdvanceModel.setData(oData);
    },

    _applyPendingFilter: function () {
  var oBinding = this.byId("approvalsTable").getBinding("items");
  if (!oBinding) return;

  oBinding.changeParameters({
    $filter: "status eq 'SUBMITTED' or status eq 'SUPERVISOR_APPROVED'",
    $orderby: "requestNumber desc"
  });
},

    _refreshTable: function () {
      this._applyPendingFilter();
      var oBinding = this.byId("approvalsTable").getBinding("items");
      if (oBinding) oBinding.refresh();
    },

    formatStatus: function (sStatus) {
      return STATUS_LABELS[sStatus] || sStatus;
    },

    formatStatusState: function (sStatus) {
      var sLabel = STATUS_LABELS[sStatus] || sStatus;
      return STATUS_STATES[sLabel] || "None";
    },

    onRefreshPress: function () {
      this._refreshTable();
      MessageToast.show("Approvals refreshed.");
    },

    onSearchLiveChange: function (oEvent) {
  var sQuery = (oEvent.getParameter("newValue") || "").replace(/'/g, "''");
  var oBinding = this.byId("approvalsTable").getBinding("items");
  if (!oBinding) return;

  var sStatusFilter = "(status eq 'SUBMITTED' or status eq 'SUPERVISOR_APPROVED')";

  if (!sQuery) {
    oBinding.changeParameters({ $filter: sStatusFilter, $orderby: "requestNumber desc" });
    return;
  }

  var sTextFilter =
    "(contains(requestNumber,'" + sQuery + "') or " +
    "contains(employeeName,'" + sQuery + "') or " +
    "contains(employeeEmail,'" + sQuery + "'))";

  oBinding.changeParameters({
    $filter: sStatusFilter + " and " + sTextFilter,
    $orderby: "requestNumber desc"
  });
},
    onReviewPress: async function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext();
      var oClaim = oCtx && oCtx.getObject();
      if (!oClaim) return;

      try {
        await this._loadClaimIntoWizard(oClaim.ID);
        this.getOwnerComponent().navToClaim();
      } catch (oErr) {
        var sMsg = (oErr && oErr.error && oErr.error.message) || "Could not load this claim.";
        MessageBox.error(sMsg);
      }
    },

    _loadClaimIntoWizard: async function (sClaimId) {
      var oWizardModel = this.getOwnerComponent().getModel("wizard");
      var sUrl = "/travel/TravelClaims('" + sClaimId + "')?$expand=dailyAllowances,hotelExpenses,expenseItems";

      var res = await fetch(sUrl);
      if (!res.ok) {
        throw await res.json();
      }
      var oData = await res.json();

      oData._savedId = oData.ID;
      oData.viewMode = true;
      oData.reviewMode = true; // shows Approve/Reject buttons on the FT Coverpage form
      oData.dailyAllowances = oData.dailyAllowances || [];
      oData.hotelExpenses = oData.hotelExpenses || [];
      oData.expenseItems = oData.expenseItems || [];

      oWizardModel.setData(oData);
    }

  });
});