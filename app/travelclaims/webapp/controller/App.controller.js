sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "etravel/travelclaims/model/models",
  "etravel/travelclaims/model/csrf"
], function (Controller, JSONModel, MessageToast, MessageBox, models, csrf) {
  "use strict";

  return Controller.extend("etravel.travelclaims.controller.App", {

    onInit: function () {
      // wizard model already set up in Component.js
    },

    // =========================================================
    // PART 1: DAILY ALLOWANCE row handlers
    // =========================================================

    onAddDailyAllowanceRow: function () {
      var oModel = this.getOwnerComponent().getModel("wizard");
      var aRows = oModel.getProperty("/dailyAllowances");
      aRows.push({
        origin: "", originDate: null,
        destination: "", reachingDate: null, departureDate: null,
        totalDays: 0, designationBand: "MGR and Below",
        dailyPerDiemRate: 0, currency: oModel.getProperty("/headerCurrency") || "THB",
        fxRate: oModel.getProperty("/headerFxRate") || 1,
        amount: 0, amountTHB: 0
      });
      oModel.setProperty("/dailyAllowances", aRows);
    },

    onDeleteDailyAllowanceRow: function (oEvent) {
      this._deleteRow(oEvent, "/dailyAllowances");
      this._recalculateTotals();
    },

    onRecalculate: function (oEvent) {
      var oInput = oEvent.getSource();
      var sValue = oEvent.getParameter("value");
      var oBinding = oInput.getBinding("value");
      if (oBinding) {
        oBinding.setValue(sValue);
      }
      this._recalculateTotals();
    },

    // =========================================================
    // PART 2: HOTEL EXPENSES row handlers
    // =========================================================

    onAddHotelExpenseRow: function () {
      var oModel = this.getOwnerComponent().getModel("wizard");
      var aRows = oModel.getProperty("/hotelExpenses");
      aRows.push({
        hotelName: "", checkInDate: null, checkOutDate: null,
        totalStayDays: 0, transactionType: "Cash",
        roomRatePerDay: 0, currency: oModel.getProperty("/headerCurrency") || "THB",
        totalBillAmount: 0, otherHotelExpenses: 0, totalHotelExpenses: 0,
        fxRate: oModel.getProperty("/headerFxRate") || 1,
        totalTHB: 0, requiresCFOApproval: false
      });
      oModel.setProperty("/hotelExpenses", aRows);
    },

    onDeleteHotelExpenseRow: function (oEvent) {
      this._deleteRow(oEvent, "/hotelExpenses");
      this._recalculateTotals();
    },

    _validateAttachments: function () {
      var oModel = this.getOwnerComponent().getModel("wizard");
      var oData = oModel.getData();
      var aMissing = [];

      (oData.dailyAllowances || []).forEach(function (r, i) {
        if (!r.attachmentRef) aMissing.push("Daily Allowance row " + (i + 1));
      });
      (oData.hotelExpenses || []).forEach(function (r, i) {
        if (!r.attachmentRef) aMissing.push("Hotel Expense row " + (i + 1));
      });
      (oData.expenseItems || []).forEach(function (r, i) {
        if (!r.attachmentRef) aMissing.push("Other Expense row " + (i + 1));
      });

      return aMissing;
    },

    // =========================================================
    // PART 3: OTHER EXPENSES row handlers
    // =========================================================

    onAddExpenseItemRow: function () {
      var oModel = this.getOwnerComponent().getModel("wizard");
      var aRows = oModel.getProperty("/expenseItems");
      aRows.push({
        lineNo: aRows.length + 1,
        section: "A",
        description: "", category: "Others",
        expenseDate: null, isCashTransaction: false,
        currency: oModel.getProperty("/headerCurrency") || "THB",
        fxRate: oModel.getProperty("/headerFxRate") || 1,
        amountForeign: 0, amountTHB: 0
      });
      oModel.setProperty("/expenseItems", aRows);
    },

    onDeleteExpenseItemRow: function (oEvent) {
      var oModel = this.getOwnerComponent().getModel("wizard");
      this._deleteRow(oEvent, "/expenseItems");
      // renumber lineNo after delete
      var aRows = oModel.getProperty("/expenseItems");
      aRows.forEach(function (r, i) { r.lineNo = i + 1; });
      oModel.setProperty("/expenseItems", aRows);
      this._recalculateTotals();
    },

    // ---------- shared row delete helper ----------
    _deleteRow: function (oEvent, sPath) {
      var oCtx = oEvent.getSource().getBindingContext("wizard");
      var oModel = this.getOwnerComponent().getModel("wizard");
      var aRows = oModel.getProperty(sPath);
      var iIndex = aRows.indexOf(oCtx.getObject());
      if (iIndex > -1) {
        aRows.splice(iIndex, 1);
        oModel.setProperty(sPath, aRows);
      }
    },

    // ---------- auto-fill approver emails (no manual entry on the form) ----------
    // Since the Supervisor Email / VP Finance Email input fields were removed
    // from the form, this derives sensible placeholder addresses from the
    // employee's own email domain, so Approve always has someone to notify.
    _autoFillApproverEmails: function (oData) {
      if (oData.employeeEmail && (!oData.supervisorEmail || !oData.vpFinanceEmail)) {
        var sDomain = oData.employeeEmail.split('@')[1] || 'ext.indorama.net';
        if (!oData.supervisorEmail) oData.supervisorEmail = 'supervisor@' + sDomain;
        if (!oData.vpFinanceEmail) oData.vpFinanceEmail = 'vpfinance@' + sDomain;
      }
    },

    // ---------- totals ----------
    _recalculateTotals: function () {
      var oModel = this.getOwnerComponent().getModel("wizard");
      var oData = oModel.getData();

      // Leftover Advance Amount = Advance Amount - Advance Refunded Amount,
      // only when Advance Refund Confirmation is Yes (matches the view's display formula)
      var bRefundConfirmed = (oData.advanceRefundConfirmation === true || oData.advanceRefundConfirmation === "true");
      oData.leftoverAdvanceAmount = bRefundConfirmed
        ? ((parseFloat(oData.advanceAmount) || 0) - (parseFloat(oData.advanceRefundedAmount) || 0))
        : 0;
      oModel.setProperty("/leftoverAdvanceAmount", oData.leftoverAdvanceAmount);

      // Recompute each row's derived amount, then sum
      var fDailyTotal = (oData.dailyAllowances || []).reduce(function (sum, r) {
        r.amount = (parseFloat(r.totalDays) || 0) * (parseFloat(r.dailyPerDiemRate) || 0);
        r.amountTHB = r.amount * (parseFloat(r.fxRate) || 1);
        return sum + r.amountTHB;
      }, 0);

      var fHotelTotal = (oData.hotelExpenses || []).reduce(function (sum, r) {
        r.totalBillAmount = (parseFloat(r.roomRatePerDay) || 0) * (parseFloat(r.totalStayDays) || 0);
        r.totalHotelExpenses = r.totalBillAmount + (parseFloat(r.otherHotelExpenses) || 0);
        r.totalTHB = r.totalHotelExpenses * (parseFloat(r.fxRate) || 1);
        return sum + r.totalTHB;
      }, 0);

      var fOtherTotal = (oData.expenseItems || []).reduce(function (sum, r) {
        r.amountTHB = (parseFloat(r.amountForeign) || 0) * (parseFloat(r.fxRate) || 1);
        return sum + r.amountTHB;
      }, 0);

      var fGrandTotal = fDailyTotal + fHotelTotal + fOtherTotal;

      oModel.setProperty("/dailyAllowances", oData.dailyAllowances);
      oModel.setProperty("/hotelExpenses", oData.hotelExpenses);
      oModel.setProperty("/expenseItems", oData.expenseItems);
      oModel.setProperty("/totalExpensesClaimed", fGrandTotal);
      oModel.setProperty("/totalClaimAmount", fGrandTotal);
    },

    // =========================================================
    // SAVE / SUBMIT — shared payload builder + persist helper
    // =========================================================

    _buildPayload: function (oData, sStatus) {
      return {
        employeeName: oData.employeeName,
        employeeId: oData.employeeId,
        employeeEmail: oData.employeeEmail,
        sfid: oData.sfid,
        employeeDesignation: oData.employeeDesignation,
        costCenter: oData.costCenter,
        expenseCategory: oData.expenseCategory,
        supervisorName: oData.supervisorName,
        supervisorDesignation: oData.supervisorDesignation,
        supervisorEmail: oData.supervisorEmail,
        vpFinanceEmail: oData.vpFinanceEmail,
        travelDestinationCity: oData.travelDestinationCity,
        travelDestinationCountry: oData.travelDestinationCountry,
        tripScheduleFrom: oData.tripScheduleFrom,
        tripScheduleTo: oData.tripScheduleTo,
        projectCode: oData.projectCode,
        claimDate: oData.claimDate,
        claimPeriod: oData.claimPeriod,
        extensionNo: oData.extensionNo,
        paidTo: oData.paidTo,
        headerCurrency: oData.headerCurrency,
        headerFxRate: oData.headerFxRate,
        advanceConfirmation: (oData.advanceConfirmation === true || oData.advanceConfirmation === "true"),
        advanceCurrency: oData.advanceCurrency,
        advanceAmount: oData.advanceAmount,
        advanceAmountLocalCurrency: oData.advanceAmountLocalCurrency,
        advanceRefundConfirmation: (oData.advanceRefundConfirmation === true || oData.advanceRefundConfirmation === "true"),
        advanceRefundedAmount: oData.advanceRefundedAmount,
        leftoverAdvanceAmount: oData.leftoverAdvanceAmount,
        totalExpensesClaimed: oData.totalExpensesClaimed,
        totalClaimAmount: oData.totalClaimAmount,
        remark: oData.remark,
        declarationConfirmed: oData.declarationConfirmed,
        submittedBy: oData.submittedBy || oData.employeeName,
        approvalRoute: oData.approvalRoute,
        status: sStatus,

        // Deep insert: CAP creates all child rows in the same request
        dailyAllowances: (oData.dailyAllowances || []).map(function (r) {
          return {
            origin: r.origin, originDate: r.originDate,
            destination: r.destination, reachingDate: r.reachingDate, departureDate: r.departureDate,
            totalDays: r.totalDays, designationBand: r.designationBand,
            dailyPerDiemRate: r.dailyPerDiemRate, currency: r.currency, fxRate: r.fxRate,
            amount: r.amount, amountTHB: r.amountTHB
          };
        }),
        hotelExpenses: (oData.hotelExpenses || []).map(function (r) {
          return {
            hotelName: r.hotelName, checkInDate: r.checkInDate, checkOutDate: r.checkOutDate,
            totalStayDays: r.totalStayDays, transactionType: r.transactionType,
            roomRatePerDay: r.roomRatePerDay, currency: r.currency,
            totalBillAmount: r.totalBillAmount, otherHotelExpenses: r.otherHotelExpenses,
            totalHotelExpenses: r.totalHotelExpenses, fxRate: r.fxRate, totalTHB: r.totalTHB,
            region: r.region, requiresCFOApproval: r.requiresCFOApproval
          };
        }),
        expenseItems: (oData.expenseItems || []).map(function (r) {
          return {
            lineNo: r.lineNo, section: r.section, category: r.category,
            expenseDate: r.expenseDate, description: r.description,
            currency: r.currency, fxRate: r.fxRate,
            amountForeign: r.amountForeign, amountTHB: r.amountTHB,
            isCashTransaction: (r.isCashTransaction === true || r.isCashTransaction === "true")
          };
        })
      };
    },

    // Creates the claim on first save, updates it on every save/submit after that,
    // so Save -> Save -> Submit all act on the SAME backend record (no duplicates).
    _persistClaim: function (sStatus) {
      var oModel = this.getOwnerComponent().getModel("wizard");
      this._recalculateTotals();
      var oData = oModel.getData();
      this._autoFillApproverEmails(oData);
      var oPayload = this._buildPayload(oData, sStatus);
      var sSavedId = oData._savedId;
      var sUrl = sSavedId ? "/travel/TravelClaims('" + sSavedId + "')" : "/travel/TravelClaims";
      var sMethod = sSavedId ? "PATCH" : "POST";

      return csrf.fetchWithCsrf(sUrl, {
        method: sMethod,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(oPayload)
      }).then(function (res) {
        if (!res.ok) {
          return res.json().then(function (err) { throw err; });
        }
        return res.json();
      }).then(function (oResult) {
        var sId = oResult.ID || sSavedId;
        var sYear = new Date().getFullYear();
        var sClaimNumber = "EC-" + sYear + "-" + sId.substring(0, 4).toUpperCase();

        oModel.setProperty("/_savedId", sId);
        oModel.setProperty("/claimNumber", sClaimNumber);
        oModel.setProperty("/claimStatusText", sStatus === "SUBMITTED" ? "Submitted" : "Draft");
        oModel.setProperty("/submitStatusText", sStatus === "SUBMITTED" ? "Submitted" : "Saved as Draft");

        return { id: sId, claimNumber: sClaimNumber };
      });
    },

    // Calls the formal "submitClaim" action on the backend. This is what actually
    // runs CFO-approval validation, flips status to SUBMITTED, and kicks off the
    // BPA approval workflow. A plain PATCH on the entity does NOT do any of this.
    _callSubmitAction: function (sClaimId) {
      return csrf.fetchWithCsrf("/travel/submitClaim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimID: sClaimId })
      }).then(function (res) {
        if (!res.ok) {
          return res.json().then(function (err) { throw err; });
        }
        return res.json();
      });
    },

    // ---------- SAVE: persist as DRAFT, minimal validation, no BPA hand-off ----------
    onSaveClaim: function () {
      var oModel = this.getOwnerComponent().getModel("wizard");
      var oData = oModel.getData();

      if (!oData.employeeName) {
        MessageToast.show("Please enter the Employee Name before saving.");
        return;
      }

      this._persistClaim("DRAFT")
        .then(function (oRes) {
          MessageToast.show("Saved as draft (" + oRes.claimNumber + "). You can continue editing or submit later.");
        })
        .catch(function (oErr) {
          var sMsg = (oErr && oErr.error && oErr.error.message) || "Something went wrong while saving the draft.";
          MessageBox.error(sMsg);
        });
    },

    // ---------- SUBMIT: save the data, then call the "submitClaim" action ----------
    // This runs full validation (CFO approval check), flips status to SUBMITTED,
    // and starts the BPA approval process — all inside the backend action.
    onSubmitClaim: function () {
      if (this._bSubmitInProgress) return;

      var oModel = this.getOwnerComponent().getModel("wizard");
      var oData = oModel.getData();
      var that = this;

      if (!oData.employeeName) {
        MessageToast.show("Please enter the Employee Name.");
        return;
      }
      if (!oData.declarationConfirmed) {
        MessageToast.show("Please confirm the declaration before submitting.");
        return;
      }

      var aMissingAttachments = this._validateAttachments();
      if (aMissingAttachments.length) {
        MessageBox.error("Please attach a supporting document for:\n" + aMissingAttachments.join("\n"));
        return;
      }

      this._bSubmitInProgress = true;

      this._persistClaim("DRAFT")
        .then(function (oRes) {
          return that._callSubmitAction(oRes.id);
        })
        .then(function () {
          MessageToast.show("Submitted Successfully");
          that.onCloseWizard();
        })
        .catch(function (oErr) {
          var sMsg = (oErr && oErr.error && oErr.error.message) || "Something went wrong while submitting the claim.";
          MessageBox.error(sMsg);
        })
        .finally(function () {
          that._bSubmitInProgress = false;
        });
    },

    // ---------- Approve / Reject from the Review page ----------
    onApproveFromReview: function () {
      if (this._bReviewActionInProgress) return;
      var oModel = this.getOwnerComponent().getModel("wizard");
      var oData = oModel.getData();
      var sClaimId = oData._savedId;
      var sStatus = oData.status;
      var sApprover = (sStatus === "SUPERVISOR_APPROVED") ? oData.vpFinanceEmail : oData.supervisorEmail;
      var sAction = (sStatus === "SUPERVISOR_APPROVED") ? "approveByVPFinance" : "approveBySupervisor";
      var sComment = (sStatus === "SUPERVISOR_APPROVED") ? oData.vpFinanceComment : oData.supervisorComment;

      if (!sApprover) {
        MessageToast.show("Missing approver email on this claim — cannot approve.");
        return;
      }

      var that = this;
      MessageBox.confirm("Approve this travel request as " + sApprover + "?", {
        title: "Approve Travel Request",
        onClose: function (sAction2) {
          if (sAction2 !== MessageBox.Action.OK) return;
          that._bReviewActionInProgress = true;
          csrf.fetchWithCsrf("/travel/" + sAction, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ claimID: sClaimId, approver: sApprover, comment: sComment })
          }).then(function (res) {
            if (!res.ok) return res.json().then(function (err) { throw err; });
            return res.json();
          }).then(function () {
            MessageToast.show("Claim approved.");
            that.onCloseWizard();
          }).catch(function (oErr) {
            var sMsg = (oErr && oErr.error && oErr.error.message) || "Something went wrong while approving.";
            MessageBox.error(sMsg);
          }).finally(function () {
            that._bReviewActionInProgress = false;
          });
        }
      });
    },

    onRejectFromReview: function () {
      if (this._bReviewActionInProgress) return;
      var oModel = this.getOwnerComponent().getModel("wizard");
      var sClaimId = oModel.getProperty("/_savedId");
      var sStatus = oModel.getProperty("/status");
      var sComment = (sStatus === "SUPERVISOR_APPROVED") ? oModel.getProperty("/vpFinanceComment") : oModel.getProperty("/supervisorComment");
      var that = this;

      MessageBox.confirm("Are you sure you want to reject this travel request?", {
        title: "Reject Travel Request",
        onClose: function (sAction) {
          if (sAction !== MessageBox.Action.OK) return;
          that._bReviewActionInProgress = true;
          csrf.fetchWithCsrf("/travel/rejectClaim", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ claimID: sClaimId, comment: sComment })
          }).then(function (res) {
            if (!res.ok) return res.json().then(function (err) { throw err; });
            return res.json();
          }).then(function () {
            MessageToast.show("Claim rejected.");
            that.onCloseWizard();
          }).catch(function (oErr) {
            var sMsg = (oErr && oErr.error && oErr.error.message) || "Something went wrong while rejecting.";
            MessageBox.error(sMsg);
          }).finally(function () {
            that._bReviewActionInProgress = false;
          });
        }
      });
    },

    // ---------- view saved claim in a new tab ----------
    onViewClaim: function () {
      var oModel = this.getOwnerComponent().getModel("wizard");
      var sId = oModel.getProperty("/_savedId");
      if (sId) {
        window.open("/travel/TravelClaims('" + sId + "')", "_blank");
      } else {
        MessageToast.show("Please submit the claim first.");
      }
    },

    // ---------- close / reset form and go back to Dashboard ----------
    onCloseWizard: function () {
      var oComponent = this.getOwnerComponent();
      oComponent.setModel(new JSONModel(models.getBlankClaim()), "wizard");
      oComponent.navToDashboard();
    }

  });
});