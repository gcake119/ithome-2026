const DEFAULT_RESULT = Object.freeze({ publishClickCount: 0, publicVerification: 'not_started' });

function outcome(status, fingerprint, reasonCode, overrides = {}) {
  return {
    status,
    fingerprint,
    result: { reasonCode, ...DEFAULT_RESULT, ...overrides },
  };
}

function exactSession(session, { expectedAccount, expectedSeriesTitle, expectedContestTag }) {
  if (session.antiAutomation) return 'anti_automation';
  if (!session?.authenticated) return 'login_required';
  if (session.account !== expectedAccount) return 'unexpected_account';
  return null;
}

function exactDraft(snapshot, payload, { expectedSeriesTitle, expectedContestTag }) {
  return snapshot?.status === 'draft'
    && snapshot.title === payload.title
    && snapshot.firstBodyLine === payload.syncLine
    && snapshot.seriesTitle === expectedSeriesTitle
    && snapshot.contestTag === expectedContestTag;
}

export function createIthomeBrowserAdapter({
  driver,
  expectedAccount,
  expectedSeriesTitle,
  expectedContestTag,
  loadBootstrap,
}) {
  if (!driver || typeof loadBootstrap !== 'function') throw new Error('driver and loadBootstrap are required');
  if (![expectedAccount, expectedSeriesTitle, expectedContestTag].every((value) => typeof value === 'string' && value)) {
    throw new Error('expected account, series title, and contest tag are required');
  }

  return async function publish({ payload, fingerprint, runId }) {
    let bootstrap = null;
    if (payload.day > 1) {
      try { bootstrap = await loadBootstrap(); } catch { return outcome('blocked', fingerprint, 'series_bootstrap_invalid'); }
      if (!bootstrap) return outcome('blocked', fingerprint, 'series_bootstrap_missing');
      if (bootstrap.status !== 'verified' || typeof bootstrap.seriesUrl !== 'string' || !bootstrap.seriesUrl) {
        return outcome('blocked', fingerprint, 'series_bootstrap_invalid');
      }
    }

    let publishClickCount = 0;
    try {
      await driver.connect({ runId });

      const session = await driver.inspectSession();
      const sessionFailure = exactSession(session, { expectedAccount, expectedSeriesTitle, expectedContestTag });
      if (sessionFailure) return outcome('blocked', fingerprint, sessionFailure);

      const drafts = await driver.scanDrafts({ payload, bootstrap });
      if (!Array.isArray(drafts)) return outcome('failed', fingerprint, 'draft_scan_incomplete');
      if (drafts.length === 0) return outcome('blocked', fingerprint, 'draft_missing');
      if (drafts.length > 1) return outcome('blocked', fingerprint, 'draft_duplicate');

      const publicEntries = await driver.scanPublic({ payload, bootstrap });
      if (!Array.isArray(publicEntries)) return outcome('failed', fingerprint, 'public_scan_incomplete');
      if (publicEntries.length > 0) return outcome('blocked', fingerprint, 'already_published');

      const draft = await driver.inspectDraft({ draft: drafts[0], payload, bootstrap });
      if (!exactDraft(draft, payload, { expectedSeriesTitle, expectedContestTag })) return outcome('blocked', fingerprint, 'draft_mismatch');

      const publishResult = await driver.publishOnce({ draft: drafts[0], payload, bootstrap });
      if (!publishResult?.clicked) return outcome('failed', fingerprint, 'publish_not_clicked');
      publishClickCount = 1;

      try {
        const verification = await driver.verifyPublic({ payload, bootstrap });
        if (!verification?.verified) {
          return outcome('uncertain', fingerprint, 'post_publish_unverified', { publishClickCount, publicVerification: 'uncertain' });
        }
        return outcome('verified', fingerprint, 'published', {
          publishClickCount,
          publicVerification: 'verified',
          articleUrl: verification.articleUrl,
          title: payload.title,
          canonicalUrl: payload.canonicalUrl,
        });
      } catch {
        return outcome('uncertain', fingerprint, 'post_publish_unverified', { publishClickCount, publicVerification: 'uncertain' });
      }
    } catch (error) {
      const reasonCode = error?.reasonCode || (publishClickCount === 1 ? 'post_publish_unverified' : 'browser_driver_failed');
      const status = publishClickCount === 1 ? 'uncertain' : 'failed';
      return outcome(status, fingerprint, reasonCode, {
        publishClickCount,
        publicVerification: publishClickCount === 1 ? 'uncertain' : 'not_started',
      });
    } finally {
      try { await driver.close(); } catch {}
    }
  };
}
