// srv/lib/bpaClient.js
// Handles OAuth token caching, starting a BPA process instance, and completing
// (approving/rejecting) BPA human tasks by their activityId.

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }

  const tokenUrl = `${process.env.BPA_TOKEN_URL}/oauth/token`;
  const basicAuth = Buffer.from(
    `${process.env.BPA_CLIENT_ID}:${process.env.BPA_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to get BPA access token (${res.status}): ${errText}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  // refresh 60s before actual expiry, to be safe
  tokenExpiry = now + (data.expires_in - 60) * 1000;
  return cachedToken;
}

/**
 * Starts a BPA process instance for the given TravelClaims record.
 * @param {object} claim - the TravelClaims row (must include ID, employeeName, etc.)
 */
async function startTravelApprovalProcess(claim) {
  const token = await getAccessToken();

  const payload = {
    definitionId: process.env.BPA_DEFINITION_ID,
    context: {
      claimId: claim.ID,
      employeeName: claim.employeeName || '',
      employeeEmail: claim.employeeEmail || '',
      supervisorEmail: claim.supervisorEmail || '',
      vpFinanceEmail: claim.vpFinanceEmail || '',
      totalThb: parseFloat(claim.totalClaimAmount) || 0,
      currency: claim.headerCurrency || 'THB',
      status: claim.status || 'SUBMITTED'
    }
  };

  const res = await fetch(`${process.env.BPA_API_URL}/workflow/rest/v1/workflow-instances`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to start BPA process (${res.status}): ${errText}`);
  }

  return res.json();
}

/**
 * Polls BPA for a READY task matching the given workflow instance and activityId.
 * Retries a few times since BPA may take a moment to create the next task
 * right after the previous one is completed.
 */
async function getReadyTaskForActivity(bpaInstanceId, activityId, retries = 6, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    const token = await getAccessToken();
    const res = await fetch(
      `${process.env.BPA_API_URL}/workflow/rest/v1/task-instances?workflowInstanceId=${bpaInstanceId}&status=READY`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to fetch BPA task instances (${res.status}): ${errText}`);
    }

    const tasks = await res.json();
    const match = tasks.find((t) => !activityId || t.activityId === activityId);
    if (match) return match.id;

    // not found yet — wait and retry (BPA may still be creating the task)
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return null;
}

/**
 * Completes (approves/rejects) the READY task matching the given activityId
 * for a specific BPA process instance.
 * @param {string} bpaInstanceId - the BPA workflow instance ID (TravelClaims.bpaInstanceId)
 * @param {string} activityId - technical activity ID of the step, e.g. 'form_supervisorApproval_1'
 * @param {string} decision - 'approve' or 'reject'
 */
async function completeTaskForActivity(bpaInstanceId, activityId, decision) {
  const taskId = await getReadyTaskForActivity(bpaInstanceId, activityId);
  if (!taskId) {
    throw new Error(
      `No READY task found for activity '${activityId}' on instance ${bpaInstanceId} — it may already be completed.`
    );
  }

  const token = await getAccessToken();
  const res = await fetch(`${process.env.BPA_API_URL}/workflow/rest/v1/task-instances/${taskId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status: 'COMPLETED', decision })
  });

if (!res.ok) {
  const errText = await res.text();
  throw new Error(`Failed to complete BPA task (${res.status}): ${errText}`);
}

// BPA returns 204 No Content on success — no body to parse.
if (res.status === 204) {
  return { success: true };
}
return res.json();
}

module.exports = { startTravelApprovalProcess, completeTaskForActivity };