sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "etravel/travelclaims/model/models",
  "etravel/travelclaims/model/csrf"
], function (Controller, JSONModel, MessageToast, MessageBox, models, csrf) {
  "use strict";

  return Controller.extend("etravel.travelclaims.controller.TravelAdvance", {

    onInit: function () {
      // "advance" model already set up in Component.js
    },

    onRecalculate: function (oEvent) {
      var oModel = this.getOwnerComponent().getModel("advance");
      var oData = oModel.getData();
      var sChangedPath = oEvent.getSource().getBinding("value").getPath();
      var sLiveValue = oEvent.getParameter("value");

      var fBudget = parseFloat(sChangedPath === "/budgetAmount" ? sLiveValue : oData.budgetAmount) || 0;
      var fSpent = parseFloat(sChangedPath === "/amountAlreadySpent" ? sLiveValue : oData.amountAlreadySpent) || 0;

      oModel.setProperty("/advanceLyingUnadjusted", fBudget - fSpent);
    },

        onApproverChange: function (oEvent) {
      var oModel = this.getOwnerComponent().getModel("advance");
      var sKey = oEvent.getParameter("selectedItem").getKey();
      var mApproverEmails = {
        "Approver 1": "approver1@ext.indorama.net",
        "Approver 2": "approver2@ext.indorama.net"
      };
      oModel.setProperty("/approverEmail", mApproverEmails[sKey] || "");
    },

    _buildPayload: function (oData) {
      return {
        employeeName: oData.employeeName,
        employeeEmail: oData.employeeEmail,
        extensionNo: oData.extensionNo,
        designation: oData.designation,
        countriesToVisit: oData.countriesToVisit,
        lastTraveledToCountry: oData.lastTraveledToCountry,
        budgetAmount: oData.budgetAmount,
        amountAlreadySpent: oData.amountAlreadySpent,
        advanceLyingUnadjusted: oData.advanceLyingUnadjusted,
        approverName: oData.approverName,
        approverEmail: oData.approverEmail
      };
    },

    _parseResponse: function (res) {
      if (!res.ok) return res.json().then(function (err) { throw err; });
      if (res.status === 204) return null; // CAP returns no body on a plain PATCH
      return res.json();
    },

    // Creates the record on first save, updates it on every save after that.
    // Always leaves status as DRAFT — submitAdvanceRequest is what flips it to
    // SUBMITTED. Resolves with the record's ID either way.
    _ensureSaved: function () {
      var oModel = this.getOwnerComponent().getModel("advance");
      var oData = oModel.getData();
      var oPayload = this._buildPayload(oData);
      oPayload.status = "DRAFT";

      var bIsUpdate = !!oData._savedId;
      var sMethod = bIsUpdate ? "PATCH" : "POST";
      var sUrl = bIsUpdate
        ? "/travel/TravelAdvances('" + oData._savedId + "')"
        : "/travel/TravelAdvances";

      var that = this;
      return csrf.fetchWithCsrf(sUrl, {
        method: sMethod,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(oPayload)
      }).then(this._parseResponse).then(function (oResult) {
        var sId = oData._savedId || (oResult && oResult.ID);
        oModel.setProperty("/_savedId", sId);
        return sId;
      });
    },

    onSaveAdvance: function () {
      if (this._bSaveInProgress) return;
      this._bSaveInProgress = true;

      var that = this;
      this._ensureSaved().then(function () {
        MessageToast.show("Draft saved.");
      }).catch(function (oErr) {
        var sMsg = (oErr && oErr.error && oErr.error.message) || "Something went wrong while saving the draft.";
        MessageBox.error(sMsg);
      }).finally(function () {
        that._bSaveInProgress = false;
      });
    },

    onSubmitAdvance: function () {
      if (this._bSubmitInProgress) return;

      var oModel = this.getOwnerComponent().getModel("advance");
      var oData = oModel.getData();
      var that = this;

      if (!oData.employeeName || !oData.employeeEmail) {
        MessageToast.show("Please enter Employee Name and Email.");
        return;
      }
      if (!oData.approverName || !oData.approverEmail) {
        MessageToast.show("Please enter the Approver's Name and Email.");
        return;
      }
      if (!oData.countriesToVisit) {
        MessageToast.show("Please enter Countries to Visit.");
        return;
      }

      this._bSubmitInProgress = true;

      this._ensureSaved().then(function (sAdvanceId) {
        return csrf.fetchWithCsrf("/travel/submitAdvanceRequest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ advanceID: sAdvanceId, comment: oModel.getProperty("/approvalComment") })
        });
      }).then(this._parseResponse.bind(this)).then(function () {
        MessageToast.show("Advance Request Submitted Successfully");
        that.onCloseAdvanceWizard();
      }).catch(function (oErr) {
        var sMsg = (oErr && oErr.error && oErr.error.message) || "Something went wrong while submitting the advance request.";
        MessageBox.error(sMsg);
      }).finally(function () {
        that._bSubmitInProgress = false;
      });
    },

    onApproveAdvance: function () {
      if (this._bReviewActionInProgress) return;

      var oModel = this.getOwnerComponent().getModel("advance");
      var oData = oModel.getData();
      var sAdvanceId = oData._savedId;
      var sApprover = oData.approverEmail;
      var that = this;

      MessageBox.confirm("Approve this advance request as " + sApprover + "?", {
        title: "Approve Advance Request",
        onClose: function (sAction) {
          if (sAction !== MessageBox.Action.OK) return;
          that._bReviewActionInProgress = true;
          csrf.fetchWithCsrf("/travel/approveAdvance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
           body: JSON.stringify({ advanceID: sAdvanceId, approver: sApprover, comment: oData.approvalComment })
          }).then(that._parseResponse.bind(that)).then(function () {
            MessageToast.show("Advance request approved.");
            that.onCloseAdvanceWizard();
          }).catch(function (oErr) {
            var sMsg = (oErr && oErr.error && oErr.error.message) || "Something went wrong while approving.";
            MessageBox.error(sMsg);
          }).finally(function () {
            that._bReviewActionInProgress = false;
          });
        }
      });
    },

    onRejectAdvance: function () {
      if (this._bReviewActionInProgress) return;

      var oModel = this.getOwnerComponent().getModel("advance");
      var sAdvanceId = oModel.getProperty("/_savedId");
      var that = this;

      MessageBox.confirm("Are you sure you want to reject this advance request?", {
        title: "Reject Advance Request",
        onClose: function (sAction) {
          if (sAction !== MessageBox.Action.OK) return;
          that._bReviewActionInProgress = true;
          csrf.fetchWithCsrf("/travel/rejectAdvance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ advanceID: sAdvanceId })
          }).then(that._parseResponse.bind(that)).then(function () {
            MessageToast.show("Advance request rejected.");
            that.onCloseAdvanceWizard();
          }).catch(function (oErr) {
            var sMsg = (oErr && oErr.error && oErr.error.message) || "Something went wrong while rejecting.";
            MessageBox.error(sMsg);
          }).finally(function () {
            that._bReviewActionInProgress = false;
          });
        }
      });
    },

    onCloseAdvanceWizard: function () {
      var oComponent = this.getOwnerComponent();
      oComponent.setModel(new JSONModel(models.getBlankAdvance()), "advance");
      oComponent.navToDashboard();
    }

  });
});