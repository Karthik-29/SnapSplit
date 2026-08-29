const LAST_UPDATED = 'August 29, 2026';
const REPO_URL = 'https://github.com/Karthik-29/SnapSplit';

function PrivacyPage() {
  return (
    <section>
      <h2>Privacy Policy</h2>
      <p>Last updated: {LAST_UPDATED}</p>

      <p>
        SnapSplit is a free hobby project that runs entirely in your browser. The short version:
        there is no SnapSplit server, and I never receive, see, or store any of your data.
      </p>

      <h3>No backend</h3>
      <p>
        SnapSplit is a static website. All of the work — reading the receipt, doing the math,
        showing the split — happens on your device. Nothing is sent to me, because there is
        nowhere for it to be sent.
      </p>

      <h3>Receipt images</h3>
      <p>
        When you upload a receipt photo, it's processed on your device by in-browser OCR
        (Tesseract). The text-recognition model is served from this same site — no third-party
        image or OCR service is involved. Your image is never uploaded anywhere by SnapSplit and
        is discarded when you close or reload the tab.
      </p>

      <h3>Bill data</h3>
      <p>
        Party names, participant names, items, claims, and any discount live only in your
        browser's memory while the app is open. The one place this data can persist is a Google
        Sheet that you own and pick yourself. If you don't connect a sheet, nothing is saved once
        the tab closes.
      </p>

      <h3>Google account access</h3>
      <p>
        If you choose to save a party, SnapSplit uses Google Sign-In and Google Picker with the
        least-privilege <code>drive.file</code> scope. That means SnapSplit can only access the
        specific spreadsheet you select in the picker — not the rest of your Google Drive. Only a
        public Google client ID is used; SnapSplit never sees your password or any secret. The
        access token stays in your browser for the current page session and is dropped when you
        reload or sign out.
      </p>

      <h3>No tracking</h3>
      <p>
        SnapSplit sets no analytics, no advertising, no third-party trackers, and no cookies
        beyond what the browser needs to run the page. There is no usage logging on my side.
      </p>

      <h3>Hosting</h3>
      <p>
        The site is served as static files by GitHub Pages. As with any website, the host
        (GitHub) may log basic technical request data such as your IP address and browser type,
        under{' '}
        <a
          href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub's own privacy statement
        </a>
        . That's outside my control and I don't have access to it.
      </p>

      <h3>Your data, your control</h3>
      <p>
        Close the tab to clear everything held in memory. To remove data you saved, delete or
        unshare the Google Sheet. You can revoke SnapSplit's access to your Google account at any
        time at{' '}
        <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
          myaccount.google.com/permissions
        </a>
        .
      </p>

      <h3>Children</h3>
      <p>
        SnapSplit isn't directed at children under 13 (or the minimum age of digital consent where
        you live), and I don't knowingly collect anything from them — or from anyone.
      </p>

      <h3>Changes</h3>
      <p>
        I may update this policy from time to time; the "last updated" date above will change when
        I do. Questions? Open an issue at{' '}
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
          github.com/Karthik-29/SnapSplit
        </a>
        .
      </p>
    </section>
  );
}

export default PrivacyPage;
