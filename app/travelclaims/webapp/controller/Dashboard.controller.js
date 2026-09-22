sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/model/Sorter",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/m/ActionSheet",
  "sap/m/Button"
], function (Controller, JSONModel, Filter, FilterOperator, Sorter, MessageToast, MessageBox, ActionSheet, Button) {
  "use strict";

  // Advance status -> friendly display label
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

  // Backend status -> friendly display label
  var STATUS_LABELS = {
    DRAFT: "Draft",
    SUBMITTED: "Pending",
    SUPERVISOR_APPROVED: "Pending",
    VP_APPROVED: "Pending",
    PAID: "Completed",
    REJECTED: "Rejected",
    RETURNED: "Returned"
  };

  // Friendly label -> ObjectStatus state (color)
  var STATUS_STATES = {
    Draft: "None",
    Pending: "Warning",
    Completed: "Success",
    Rejected: "Error",
    Returned: "Warning"
  };

  return Controller.extend("etravel.travelclaims.controller.Dashboard", {

    onInit: function () {
  this._loadCounts();
  this._refreshTable();
  this._refreshAdvancesTable();
  sap.ui.getCore().getEventBus().subscribe("etravel", "dashboardShown", this._onDashboardShown, this);
},

_onDashboardShown: function () {
  this._loadCounts();
  this._refreshTable();
  this._refreshAdvancesTable();
},

    _loadCounts: async function () {
      const oModel = this.getOwnerComponent().getModel();
      const oBinding = oModel.bindContext("/getDashboardCounts(...)");
      await oBinding.execute();
      const oResult = oBinding.getBoundContext().getObject();
      this.getView().setModel(new JSONModel(oResult), "dashboard");
    },

  _refreshTable: function () {
  var oBinding = this.byId("claimsTable").getBinding("items");
  if (oBinding) {
    oBinding.changeParameters({ $orderby: "requestNumber desc" });
    oBinding.refresh();
  }
},

_refreshAdvancesTable: function () {
  var oBinding = this.byId("advancesTable").getBinding("items");
  if (oBinding) {
    oBinding.changeParameters({ $orderby: "requestNumber desc" });
    oBinding.refresh();
  }
},

formatAdvanceStatus: function (sStatus) {
  return ADVANCE_STATUS_LABELS[sStatus] || sStatus;
},

formatAdvanceStatusState: function (sStatus) {
  var sLabel = ADVANCE_STATUS_LABELS[sStatus] || sStatus;
  return ADVANCE_STATUS_STATES[sLabel] || "None";
},

onAdvanceActionsPress: function (oEvent) {
  var oButton = oEvent.getSource();
  var oCtx = oButton.getBindingContext();
  var oAdvance = oCtx && oCtx.getObject();
  if (!oAdvance) return;

  if (this._oAdvanceActionSheet) {
    this._oAdvanceActionSheet.destroy();
  }

  var aButtons = [
    new Button({
      text: "View",
      icon: "sap-icon://display",
      press: this._onViewAdvanceAction.bind(this)
    })
  ];

  this._oAdvanceActionSheet = new ActionSheet({
    title: "Actions",
    buttons: aButtons
  });
  this.getView().addDependent(this._oAdvanceActionSheet);
  this._oAdvanceActionSheet.data("advanceId", oAdvance.ID);
  this._oAdvanceActionSheet.openBy(oButton);
},

_onViewAdvanceAction: async function () {
  var sAdvanceId = this._oAdvanceActionSheet.data("advanceId");
  if (!sAdvanceId) return;

  try {
    await this._loadAdvanceIntoWizard(sAdvanceId, false);
    this.getOwnerComponent().navToAdvance();
  } catch (oErr) {
    var sMsg = (oErr && oErr.error && oErr.error.message) || "Could not load this advance.";
    MessageBox.error(sMsg);
  }
},

_loadAdvanceIntoWizard: async function (sAdvanceId, bReviewMode) {
  var oAdvanceModel = this.getOwnerComponent().getModel("advance");
  var sUrl = "/travel/TravelAdvances('" + sAdvanceId + "')";

  var res = await fetch(sUrl);
  if (!res.ok) {
    throw await res.json();
  }
  var oData = await res.json();

  oData._savedId = oData.ID;
  oData.viewMode = true;
  oData.reviewMode = !!bReviewMode;

  oAdvanceModel.setData(oData);
},

    onNewRequest: function () {
      this.getOwnerComponent().navToNewClaim();
    },

    // ---------- status formatters (used by the table's ObjectStatus) ----------

    formatStatus: function (sStatus) {
      return STATUS_LABELS[sStatus] || sStatus;
    },

    formatStatusState: function (sStatus) {
      var sLabel = STATUS_LABELS[sStatus] || sStatus;
      return STATUS_STATES[sLabel] || "None";
    },

    // ---------- toolbar actions ----------

    onRefreshPress: function () {
      this._loadCounts();
      this._refreshTable();
      MessageToast.show("Dashboard refreshed.");
    },

    onFilterPress: function () {
      var that = this;
      sap.ui.require([
        "sap/m/ViewSettingsDialog",
        "sap/m/ViewSettingsFilterItem",
        "sap/m/ViewSettingsItem",
        "sap/ui/model/Filter",
        "sap/ui/model/FilterOperator"
      ], function (ViewSettingsDialog, ViewSettingsFilterItem, ViewSettingsItem, Filter, FilterOperator) {

        if (!that._oFilterDialog) {
          that._oFilterDialog = new ViewSettingsDialog({
            confirm: function (oEvent) {
              var aFilterItems = oEvent.getParameter("filterItems");
              var oBinding = that.byId("claimsTable").getBinding("items");

              if (!aFilterItems.length) {
                oBinding.filter([]);
                return;
              }

              var aFilters = aFilterItems.map(function (oItem) {
                return new Filter("status", FilterOperator.EQ, oItem.getKey());
              });
              oBinding.filter(new Filter({ filters: aFilters, and: false }));
            },
            resetFilters: function () {
              that.byId("claimsTable").getBinding("items").filter([]);
            }
          });

          that._oFilterDialog.addFilterItem(new ViewSettingsFilterItem({
            key: "status",
            text: "Status",
            items: [
              new ViewSettingsItem({ key: "DRAFT", text: "Draft" }),
              new ViewSettingsItem({ key: "SUBMITTED", text: "Submitted" }),
              new ViewSettingsItem({ key: "SUPERVISOR_APPROVED", text: "Supervisor Approved" }),
              new ViewSettingsItem({ key: "VP_APPROVED", text: "VP Approved" }),
              new ViewSettingsItem({ key: "PAID", text: "Paid / Completed" }),
              new ViewSettingsItem({ key: "REJECTED", text: "Rejected" }),
              new ViewSettingsItem({ key: "RETURNED", text: "Returned" })
            ]
          }));

          that.getView().addDependent(that._oFilterDialog);
        }

        that._oFilterDialog.open();
      });
    },

    onSearchLiveChange: function (oEvent) {
      var sQuery = oEvent.getParameter("newValue") || "";
      var oBinding = this.byId("claimsTable").getBinding("items");
      if (!oBinding) return;

      if (!sQuery) {
        oBinding.filter([]);
        return;
      }

      var aFilters = [
        new Filter("requestNumber", FilterOperator.Contains, sQuery),
        new Filter("employeeName", FilterOperator.Contains, sQuery),
        new Filter("employeeEmail", FilterOperator.Contains, sQuery),
        new Filter("company", FilterOperator.Contains, sQuery),
        new Filter("status", FilterOperator.Contains, sQuery)
      ];

      oBinding.filter(new Filter({ filters: aFilters, and: false }));
    },

    // ---------- Actions menu (View / Review) ----------

    onActionsPress: function (oEvent) {
      var oButton = oEvent.getSource();
      var oCtx = oButton.getBindingContext();
      var oClaim = oCtx && oCtx.getObject();
      if (!oClaim) return;

      // Rebuild the ActionSheet's buttons every time, since whether "Review"
      // makes sense depends on this specific claim's current status.
      if (this._oActionSheet) {
        this._oActionSheet.destroy();
      }

      var aButtons = [
        new Button({
          text: "View",
          icon: "sap-icon://display",
          press: this._onViewClaimAction.bind(this)
        })
      ];



      this._oActionSheet = new ActionSheet({
        title: "Actions",
        buttons: aButtons
      });
      this.getView().addDependent(this._oActionSheet);

      // stash which claim this ActionSheet instance is currently acting on
      this._oActionSheet.data("claimId", oClaim.ID);
      this._oActionSheet.openBy(oButton);
    },

    _onViewClaimAction: async function () {
      var sClaimId = this._oActionSheet.data("claimId");
      if (!sClaimId) return;

      try {
        await this._loadClaimIntoWizard(sClaimId, false);
        this.getOwnerComponent().navToClaim();
      } catch (oErr) {
        var sMsg = (oErr && oErr.error && oErr.error.message) || "Could not load this claim.";
        MessageBox.error(sMsg);
      }
    },

    _onReviewClaimAction: async function () {
      var sClaimId = this._oActionSheet.data("claimId");
      if (!sClaimId) return;

      try {
        await this._loadClaimIntoWizard(sClaimId, true);
        this.getOwnerComponent().navToClaim();
      } catch (oErr) {
        var sMsg = (oErr && oErr.error && oErr.error.message) || "Could not load this claim.";
        MessageBox.error(sMsg);
      }
    },

    // Fetches the full claim (with all line items) and loads it into the
    // shared "wizard" model, so the FT Coverpage form opens pre-filled.
    // bReviewMode: true shows Approve/Reject buttons on that page in addition
    // to the usual read-only view.
    _loadClaimIntoWizard: async function (sClaimId, bReviewMode) {
      var oWizardModel = this.getOwnerComponent().getModel("wizard");
      var sUrl = "/travel/TravelClaims('" + sClaimId + "')?$expand=dailyAllowances,hotelExpenses,expenseItems";

      var res = await fetch(sUrl);
      if (!res.ok) {
        throw await res.json();
      }
      var oData = await res.json();

      // Track this as the saved record so a later Save/Submit updates it
      // instead of creating a duplicate.
      oData._savedId = oData.ID;
      oData.viewMode = true; // always read-only when launched from the Dashboard
      oData.reviewMode = !!bReviewMode; // shows Approve/Reject when true
      oData.dailyAllowances = oData.dailyAllowances || [];
      oData.hotelExpenses = oData.hotelExpenses || [];
      oData.expenseItems = oData.expenseItems || [];

      oWizardModel.setData(oData);
    }

  });
});