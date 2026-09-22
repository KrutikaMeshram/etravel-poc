sap.ui.define([
  "sap/ui/core/UIComponent",
  "sap/ui/Device",
  "sap/ui/model/json/JSONModel",
  "etravel/travelclaims/model/models"
], function (UIComponent, Device, JSONModel, models) {
  "use strict";

  return UIComponent.extend("etravel.travelclaims.Component", {

    metadata: {
      manifest: "json"
    },

    init: function () {
      UIComponent.prototype.init.apply(this, arguments);
      this.setModel(models.createDeviceModel(), "device");
      this.setModel(models.createWizardModel(), "wizard");
      this.setModel(models.createAdvanceModel(), "advance");
    },

    navToClaim: function () {
      const oView = this.getRootControl();
      const oNav = oView.byId("navContainer");
      oNav.to(oView.createId("claimPage"));
    },

    // Use this (instead of navToClaim) whenever starting a brand-new claim,
    // e.g. from "New Request" / "FT Coverpage" in the side nav. It resets the
    // wizard model first, so no stale data or a leftover viewMode:true from a
    // previous "View" action carries over into the new blank form.
    navToNewClaim: function () {
      this.setModel(new JSONModel(models.getBlankClaim()), "wizard");
      this.navToClaim();
    },

    // Same idea as navToNewClaim, but for the Travel Advance form.
    navToNewAdvance: function () {
      this.setModel(new JSONModel(models.getBlankAdvance()), "advance");
      this.navToAdvance();
    },

    navToAdvance: function () {
      const oView = this.getRootControl();
      const oNav = oView.byId("navContainer");
      oNav.to(oView.createId("advancePage"));
    },

    navToApprovals: function () {
      const oView = this.getRootControl();
      const oNav = oView.byId("navContainer");
      oNav.to(oView.createId("approvalsPage"));
      sap.ui.getCore().getEventBus().publish("etravel", "approvalsShown");
    },

    navToDashboard: function () {
      const oView = this.getRootControl();
      const oNav = oView.byId("navContainer");
      oNav.to(oView.createId("dashboardPage"));
      sap.ui.getCore().getEventBus().publish("etravel", "dashboardShown");
    }
  });
});