const LAST_UPDATED = 'August 29, 2026';
const REPO_URL = 'https://github.com/Karthik-29/SnapSplit';

function TermsPage() {
  return (
    <section>
      <h2>Terms of Service</h2>
      <p>Last updated: {LAST_UPDATED}</p>

      <p>
        SnapSplit is a free, personal hobby project I (Karthik Nagraj) built for fun. It scans a
        restaurant receipt in your browser and helps a group split the bill. By using it you agree
        to the points below. If you don't agree, please don't use it.
      </p>

      <h3>It's free</h3>
      <p>
        SnapSplit costs nothing to use. There are no ads, no paid tiers, and no SnapSplit accounts
        — I don't run a server and I don't sell anything here. It's shared as-is because I thought
        it might be useful to other people too.
      </p>

      <h3>Use it at your own risk</h3>
      <p>
        SnapSplit reads receipts with imperfect optical character recognition (OCR) and then does
        arithmetic on whatever it thinks it read. It will sometimes get item names, quantities,
        prices, or totals wrong. Always check every number yourself before anyone actually pays
        anyone. SnapSplit is not financial, tax, or accounting advice, and the split it shows is
        only a suggestion for you and your friends to agree on.
      </p>

      <h3>No warranty</h3>
      <p>
        SnapSplit is provided "AS IS" and "AS AVAILABLE", without warranty of any kind, express or
        implied — including accuracy, reliability, fitness for a particular purpose, or
        uninterrupted availability. It's a side project: it may change, break, or be taken offline
        at any time, without notice.
      </p>

      <h3>Limitation of liability</h3>
      <p>
        To the fullest extent permitted by law, I am not liable for any damage, loss, cost, or
        dispute arising from your use of SnapSplit. That includes, without limitation: incorrect
        bill splits or totals, OCR mistakes, lost or corrupted data, any change to a Google Sheet
        or Google Drive file you connect, money paid or not paid between you and other people, and
        any downtime or discontinuation of the tool. You use SnapSplit because you choose to, and
        the responsibility for what you do with its output is yours.
      </p>

      <h3>Third-party services</h3>
      <p>
        SnapSplit uses Google Sign-In, Google Picker, and Google Sheets so you can save a party to
        a spreadsheet you own. Your use of those services is governed by Google's own terms and
        privacy policy, not by me. SnapSplit only ever accesses the specific spreadsheet you pick.
      </p>

      <h3>Your responsibilities</h3>
      <p>
        You're responsible for the content you enter, for the images you upload, for your own
        Google account and for how you share any spreadsheet, and for agreeing the final amounts
        with the people you're splitting with. Don't use SnapSplit for anything unlawful.
      </p>

      <h3>Changes to these terms</h3>
      <p>
        I may update these terms from time to time. Continued use after a change means you accept
        the updated terms. Significant changes will be reflected in the "last updated" date above.
      </p>

      <h3>Contact</h3>
      <p>
        Questions, bugs, or suggestions? Open an issue on the project's GitHub repository:{' '}
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
          github.com/Karthik-29/SnapSplit
        </a>
        .
      </p>
    </section>
  );
}

export default TermsPage;
