const cds = require('@sap/cds');
const { startTravelApprovalProcess, completeTaskForActivity } = require('./lib/bpaClient');

// TODO Phase 2b: replace with a real BOT (Bank of Thailand) FX rate lookup
async function getBotFxRate(currency, date) {
  return 36.0; // placeholder rate
}

const TIPS_CAP_PERCENT = 0.10;        // Tips: only 10% of the bill can be claimed

// BPA technical activity IDs (confirmed via task-instances API — casing matters)
const SUPERVISOR_ACTIVITY_ID = 'form_supervisorApproval_1';
const VP_FINANCE_ACTIVITY_ID = 'form_vPFinanceApproval_1';

/**
 * Hotel Room Charge Policy Limit matrix.
 * Rate is a per-day cap, in the currency shown per region column.
 * Regions:
 *   EuropeExclFLPL                -> EUR (Europe, except Frankfurt/London/Paris/Luxemburg)
 *   FrankfurtLondonParisLuxemburg -> EUR
 *   HKSingaporeTokyoNY            -> USD
 *   RestOfCountries               -> USD
 */
const HOTEL_POLICY_LIMITS = {
  'SVP and Above':  { EuropeExclFLPL: 200, FrankfurtLondonParisLuxemburg: 250, HKSingaporeTokyoNY: 250, RestOfCountries: 200 },
  'Vice President': { EuropeExclFLPL: 175, FrankfurtLondonParisLuxemburg: 250, HKSingaporeTokyoNY: 250, RestOfCountries: 175 },
  'JVP and AVP':    { EuropeExclFLPL: 175, FrankfurtLondonParisLuxemburg: 250, HKSingaporeTokyoNY: 250, RestOfCountries: 175 },
  'MGR and Below':  { EuropeExclFLPL: 150, FrankfurtLondonParisLuxemburg: 200, HKSingaporeTokyoNY: 200, RestOfCountries: 150 }
};

const REGION_CURRENCY = {
  EuropeExclFLPL: 'EUR',
  FrankfurtLondonParisLuxemburg: 'EUR',
  HKSingaporeTokyoNY: 'USD',
  RestOfCountries: 'USD'
};

module.exports = cds.service.impl(async function () {
  const { TravelClaims, HotelExpenses, ExpenseItems, TravelAdvances } = this.entities;

  // ---- Auto-generate Advance Request Number on creation ----
  this.before('CREATE', TravelAdvances, async (req) => {
    const year = new Date().getFullYear();
    const prefix = `AR-${year}-`;

    const existing = await SELECT.from(TravelAdvances)
      .columns('requestNumber')
      .where({ requestNumber: { like: `${prefix}%` } });

    const maxSeq = existing.reduce((max, c) => {
      const seq = parseInt((c.requestNumber || '').split('-').pop(), 10);
      return isNaN(seq) ? max : Math.max(max, seq);
    }, 0);

    const nextSeq = String(maxSeq + 1).padStart(4, '0');
    req.data.requestNumber = `${prefix}${nextSeq}`;

    if (!req.data.status) req.data.status = 'SUBMITTED';
    if (!req.data.requestDate) {
      req.data.requestDate = new Date().toISOString().slice(0, 10);
    }
  });

  // ---- Submit: just marks SUBMITTED (record is created as SUBMITTED already, this is for re-submits) ----
  this.on('submitAdvanceRequest', async (req) => {
    const { advanceID } = req.data;
    const advance = await SELECT.one.from(TravelAdvances).where({ ID: advanceID });
    if (!advance) return req.error(404, 'Advance request not found');

    await UPDATE(TravelAdvances, advanceID).with({ status: 'SUBMITTED' });
    return SELECT.one.from(TravelAdvances).where({ ID: advanceID });
  });

  // ---- Single-step approval (no BPA) ----
  this.on('approveAdvance', async (req) => {
    const { advanceID, approver, comment } = req.data;
    const advance = await SELECT.one.from(TravelAdvances).where({ ID: advanceID });
    if (!advance) return req.error(404, 'Advance request not found');

    await UPDATE(TravelAdvances, advanceID).with({
      status: 'APPROVED',
      approverEmail: approver,
      approvedOn: new Date().toISOString(),
      approvalComment: comment || '',
    });
    return SELECT.one.from(TravelAdvances).where({ ID: advanceID });
  });

  this.on('rejectAdvance', async (req) => {
    const { advanceID, comment } = req.data;
    const advance = await SELECT.one.from(TravelAdvances).where({ ID: advanceID });
    if (!advance) return req.error(404, 'Advance request not found');

    await UPDATE(TravelAdvances, advanceID).with({ status: 'REJECTED', approvalComment: comment || '' });
    return SELECT.one.from(TravelAdvances).where({ ID: advanceID });
  });

  // ---- Auto-generate Travel Request Number on creation ----
  this.before('CREATE', TravelClaims, async (req) => {
    const year = new Date().getFullYear();
    const prefix = `TR-${year}-`;

    const existing = await SELECT.from(TravelClaims)
      .columns('requestNumber')
      .where({ requestNumber: { like: `${prefix}%` } });

    const maxSeq = existing.reduce((max, c) => {
      const seq = parseInt((c.requestNumber || '').split('-').pop(), 10);
      return isNaN(seq) ? max : Math.max(max, seq);
    }, 0);

    const nextSeq = String(maxSeq + 1).padStart(4, '0');
    req.data.requestNumber = `${prefix}${nextSeq}`;

    if (!req.data.status) req.data.status = 'DRAFT';
    if (!req.data.claimDate) req.data.claimDate = new Date().toISOString().slice(0, 10);

  });

  // ---- Rule: Hotel Room Charge Policy Limit (by designation x region) ----
  this.before(['CREATE', 'UPDATE'], HotelExpenses, async (req) => {
    const item = req.data;

    // Need both the region on this hotel line and the employee's designation on the parent claim
    if (!item.region) return;

    const claimId = item.claim_ID || (req.data.claim && req.data.claim.ID);
    if (!claimId) return;

    const claim = await SELECT.one.from(TravelClaims).columns('employeeDesignation').where({ ID: claimId });
    const designation = claim && claim.employeeDesignation;
    if (!designation) return;

    const limitsForDesignation = HOTEL_POLICY_LIMITS[designation];
    if (!limitsForDesignation) return; // unrecognized designation band; skip silently

    const limit = limitsForDesignation[item.region];
    if (limit == null) return; // unrecognized region; skip silently

    const rate = parseFloat(item.roomRatePerDay) || 0;

    if (rate > limit) {
      item.requiresCFOApproval = true;
      req.info(
        `Room rate (${item.currency || REGION_CURRENCY[item.region]} ${rate}/day) exceeds the policy limit of ` +
        `${REGION_CURRENCY[item.region]} ${limit}/day for "${designation}" in this region. Dept. CFO approval is required before submission.`
      );
    }
  });

  // ---- Rule: FX rate handling ----
  // Cash transactions -> auto-pull FX rate from BOT.
  // Card transactions -> employee must supply the FX rate manually (mandatory field).
  this.before(['CREATE', 'UPDATE'], ExpenseItems, async (req) => {
    const item = req.data;

    if (item.isCashTransaction) {
      item.fxRate = await getBotFxRate(item.currency, item.expenseDate);
    } else if (item.fxRate == null) {
      req.error(400, `FX Rate is mandatory for card transactions. Please refer to the credit card statement.`);
      return;
    }

    // ---- Rule: Tips capped at 10% of the bill ----
    if (item.category === 'Tips' && item.amountForeign > 0) {
      req.info(`Reminder: Tips are only claimable up to ${TIPS_CAP_PERCENT * 100}% of the related bill.`);
    }

    // Compute THB value
    item.amountTHB = (item.amountForeign || 0) * (item.fxRate || 0);
  });

  // ---- Recalculate claim totals whenever an expense item changes ----
  this.after(['CREATE', 'UPDATE', 'DELETE'], ExpenseItems, async (data, req) => {
    const claimID = data?.claim_ID || req.data?.claim_ID;
    if (!claimID) return;

    const items = await SELECT.from(ExpenseItems).where({ claim_ID: claimID });
    const total = items.reduce((sum, i) => sum + (i.amountTHB || 0), 0);

    await UPDATE(TravelClaims, claimID).with({ totalExpensesClaimed: total, totalClaimAmount: total });
  });

this.on('submitClaim', async (req) => {
    const { claimID } = req.data;
    const claim = await SELECT.one.from(TravelClaims).where({ ID: claimID });
    if (!claim) return req.error(404, 'Claim not found');

    const cfoPending = await SELECT.from(HotelExpenses)
      .where({ claim_ID: claimID, requiresCFOApproval: true, attachmentRef: null });
    if (cfoPending.length) {
      return req.error(400, 'Please attach Dept. CFO approval for hotel charges over the policy limit before submitting.');
    }

await UPDATE(TravelClaims, claimID).with({
  status: 'SUBMITTED',
  lastActionBy: 'Requestor'
});

    const updatedClaim = await SELECT.one.from(TravelClaims).where({ ID: claimID });

    try {
      const bpaResult = await startTravelApprovalProcess(updatedClaim);
      console.log('BPA process started, instance ID:', bpaResult.id);
      await UPDATE(TravelClaims, claimID).with({ bpaInstanceId: bpaResult.id });
    } catch (err) {
      console.error('Failed to start BPA approval process:', err.message);
      // Not blocking the user's submission if BPA call fails — logged for now.
    }

    return SELECT.one.from(TravelClaims).where({ ID: claimID });
  });

  // ---- Called by BPA human task 1 (or directly from Fiori Approve action) ----
  this.on('approveBySupervisor', async (req) => {
    const { claimID, approver } = req.data;
    const claim = await SELECT.one.from(TravelClaims).where({ ID: claimID });
    if (!claim) return req.error(404, 'Claim not found');

    if (claim.bpaInstanceId) {
      try {
        await completeTaskForActivity(claim.bpaInstanceId, SUPERVISOR_ACTIVITY_ID, 'approve');
      } catch (err) {
        if (!err.message.includes('may already be completed')) {
          return req.error(400, `Could not complete BPA approval task: ${err.message}`);
        }
        console.warn('BPA task already completed — proceeding to sync local status anyway.');
      }
    }

    await UPDATE(TravelClaims, claimID).with({
      status: 'SUPERVISOR_APPROVED',
      supervisorApprovedBy: approver,
      supervisorApprovedOn: new Date().toISOString(),
      lastActionBy: 'Supervisor',
    });

    return SELECT.one.from(TravelClaims).where({ ID: claimID });
  });

  // ---- Called by BPA human task 2 (or directly from Fiori Approve action) ----
  this.on('approveByVPFinance', async (req) => {
    const { claimID, approver } = req.data;
    const claim = await SELECT.one.from(TravelClaims).where({ ID: claimID });
    if (!claim) return req.error(404, 'Claim not found');

    if (claim.bpaInstanceId) {
      try {
        await completeTaskForActivity(claim.bpaInstanceId, VP_FINANCE_ACTIVITY_ID, 'approve');
      } catch (err) {
        if (!err.message.includes('may already be completed')) {
          return req.error(400, `Could not complete BPA approval task: ${err.message}`);
        }
        console.warn('BPA task already completed — proceeding to sync local status anyway.');
      }
    }

    await UPDATE(TravelClaims, claimID).with({
      status: 'VP_APPROVED',
      vpFinanceApprovedBy: approver,
      vpFinanceApprovedOn: new Date().toISOString(),
      lastActionBy: 'VP Finance',
    });
    // Phase 6: notify / call AP here (employeeclaim.TH@indorama.net equivalent)
    return SELECT.one.from(TravelClaims).where({ ID: claimID });
  });

  this.on('rejectClaim', async (req) => {
    const { claimID } = req.data;
    const claim = await SELECT.one.from(TravelClaims).where({ ID: claimID });
    if (!claim) return req.error(404, 'Claim not found');

    if (claim.bpaInstanceId) {
      // Try Supervisor's task first, fall back to VP Finance's — whichever is currently open.
      try {
        await completeTaskForActivity(claim.bpaInstanceId, SUPERVISOR_ACTIVITY_ID, 'reject');
      } catch (err) {
        try {
          await completeTaskForActivity(claim.bpaInstanceId, VP_FINANCE_ACTIVITY_ID, 'reject');
        } catch (err2) {
          return req.error(400, `Could not complete BPA rejection task: ${err2.message}`);
        }
      }
    }

    const rejectedByLabel = (claim.status === 'SUPERVISOR_APPROVED') ? 'Rejected by VP Finance' : 'Rejected by Supervisor';
    await UPDATE(TravelClaims, claimID).with({ status: 'REJECTED', lastActionBy: rejectedByLabel });
    return SELECT.one.from(TravelClaims).where({ ID: claimID });
  });

  // ---- Dashboard tile counts ----
  this.on('getDashboardCounts', async (req) => {
    const all = await SELECT.from(TravelClaims).columns('status');
    const allAdvances = await SELECT.from(TravelAdvances).columns('status');

    const countBy = (list, statuses) =>
      list.filter(c => statuses.includes(c.status)).length;

    return {
      draftCount:     countBy(all, ['DRAFT']),
      pendingCount:   countBy(all, ['SUBMITTED', 'SUPERVISOR_APPROVED']),
      approvedCount:  countBy(all, ['VP_APPROVED']),
      completedCount: countBy(all, ['PAID']),
      returnCount:    countBy(all, ['RETURNED']),
      rejectedCount:  countBy(all, ['REJECTED']),
      advancePendingCount:  countBy(allAdvances, ['SUBMITTED']),
      advanceApprovedCount: countBy(allAdvances, ['APPROVED']),
      advanceRejectedCount: countBy(allAdvances, ['REJECTED']),
    };
  });
});