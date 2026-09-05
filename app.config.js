/**
 * Static config lives in app.json; this adds the one thing that varies.
 *
 * `KIOSK_STORE=none` selects the storeless build — the one F-Droid gets, with
 * Play Billing excluded from the native project and every paid feature
 * unlocked. Anything else, including the variable being unset, means the Play
 * build.
 *
 * Deliberately fail-closed: a typo, an empty string or a forgotten export all
 * produce the paid build, which is locked. The failure mode of getting this
 * wrong is an app that asks for money it cannot take, which is visible
 * immediately; the opposite default would silently give the pack away and look
 * exactly like everything working.
 */

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    store: process.env.KIOSK_STORE === 'none' ? 'none' : 'play',
  },
});
