sap.ui.define(["sap/ui/core/mvc/Controller"], function (Controller) {
  "use strict";
  return Controller.extend("etravel.travelclaims.controller.Main", {

    onNavBack: function () {
      this.getOwnerComponent().navToDashboard();
      this.byId("sideNav").setSelectedKey("dashboard");
    },

    onSideNavSelect: function (oEvent) {
      const oItem = oEvent.getParameter("item");
      const sKey = oItem.getKey();

      this.byId("sideNav").setSelectedKey(sKey);

      if (sKey === "dashboard") {
        this.getOwnerComponent().navToDashboard();
      } else if (sKey === "newRequest") {
        this.getOwnerComponent().navToNewClaim();
      } else if (sKey === "approvals") {
        this.getOwnerComponent().navToApprovals();
      } else if (sKey === "newAdvance") {
        this.getOwnerComponent().navToNewAdvance();
      }
    }
  });
});