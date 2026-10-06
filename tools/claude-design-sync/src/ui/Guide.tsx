/* THESIS: A reading companion for choosing the right sync workflow.
 * OWN-WORLD: Existing Minimal tokens, Inter, ink rules and native disclosure rows.
 * STORY: Compare the tools, follow a run, inspect risks, then return to the plan.
 * FIRST VIEWPORT: Shared bar, title and recommendation above a ruled comparison.
 * FORM: The supplied article's sequence, with a compact contents rail. Read mode.
 */
import { TopBar } from "./TopBar";

const SOURCES = {
  setup: "https://support.claude.com/en/articles/14604397-set-up-your-design-system-in-claude-design",
  decorators: "https://storybook.js.org/docs/writing-stories/decorators",
  headless: "https://code.claude.com/docs/en/headless",
  permissions: "https://code.claude.com/docs/en/permissions",
};

export function Guide() {
  return (
    <div className="cds-app">
      <a className="cds-skip" href="#guide">Skip to guide</a>
      <TopBar state={null} page="guide" />
      <main id="guide" className="cds-guide" tabIndex={-1}>
        <header className="cds-guide-intro">
          <p className="cds-quiet">Todoi React · Guide · Reviewed 6 October 2026</p>
          <h2>What happens when you type <code>/design-sync</code></h2>
          <p>A walkthrough of Claude Code’s design-system uploader: what it touches, where approval happens, and how it relates to this app.</p>
          <p><strong>Use this app for the hand-written Todoi kit.</strong> Try the slash command against a new design-system project first. Its generated bundle and previews may overlap with work already in the live kit.</p>
        </header>
        <div className="cds-guide-layout">
          <nav className="cds-guide-contents" aria-label="Guide contents">
            <a href="#two-tools">Two tools</a>
            <a href="#walkthrough">The run, step by step</a>
            <a href="#risks">Risks in this repo</a>
            <a href="#answers">Quick answers</a>
            <a href="#recommendations">What to do</a>
            <a href="#sources">Sources & qualifications</a>
            <a href="/">← Back to the plan</a>
          </nav>
          <article className="cds-guide-body">
            <section id="two-tools">
              <h3>Two tools with the same name</h3>
              <p>Anthropic documents <code>/design-sync</code> as a way to import existing React components and tokens into Claude Design. <a href={SOURCES.setup}>Design-system setup documentation</a>.</p>
              <div className="cds-guide-comparison">
                <div>
                  <h4><code>/design-sync</code></h4>
                  <p className="cds-quiet">Claude Code’s slash command</p>
                  <ul>
                    <li>Code → Design; this workflow does not port Design edits back into the app.</li>
                    <li>Builds a component bundle and preview cards from a Storybook or package source.</li>
                    <li>Uses generated output under <code>.design-sync/</code>.</li>
                    <li>Reviews an upload plan; login and project creation may also need approval.</li>
                    <li>Does not maintain this app’s snapshots or sync points.</li>
                  </ul>
                </div>
                <div>
                  <h4><code>npm run design-sync -- serve</code></h4>
                  <p className="cds-quiet">This local app · localhost:4477 by default</p>
                  <ul>
                    <li>Both directions: Into the App and Into Design.</li>
                    <li>Works one feature or subfeature at a time.</li>
                    <li>Edits the hand-written JSX kit, contracts, usage notes, preview cards and Minimal twins.</li>
                    <li>Uses snapshots, sync points and three-way comparisons.</li>
                    <li>Reviews AI runs, merges checked App work on approval, and hands uploads to Claude Code.</li>
                  </ul>
                </div>
              </div>
              <p>Both workflows use <code>DesignSync</code> for uploads. This app uses an interactive Claude Code session for final upload approval. That is this integration’s supported path; Claude Code also supports programmatic execution generally. <a href={SOURCES.headless}>Programmatic execution documentation</a>.</p>
              <p className="cds-guide-note">The converter details below describe the original walkthrough and the locally inspected 2.1.285 installation. They are version-specific, not a public compatibility promise. See <a href="#sources">sources & qualifications</a>.</p>
            </section>

            <section id="walkthrough">
              <h3>The run, step by step</h3>
              <p>Expand a step for detail. “Your input” marks a decision; “Local files” marks generated work. Actual prompts and their order can vary.</p>
              <ol className="cds-guide-steps" start={0}>
                <li><details><summary>Start in Claude Code <span>Your input</span></summary><div>
                  <p>From the repo root, open an interactive <code>claude</code> session and enter <code>/design-sync</code>. You can add a target hint, such as <code>/design-sync Todoi</code>.</p>
                  <p>The original article records an approval failure in <code>run-muwjvmxl</code>. This app’s README confirms that its background <code>claude -p</code> upload cannot answer the DesignSync approval prompt, so it hands the request to you. Do not generalize that failure to all headless tools or SDK permission flows. <a href={SOURCES.headless}>Claude Code’s non-interactive mode</a>.</p>
                </div></details></li>
                <li><details><summary>Authorize design-system access <span>Your input</span></summary><div>
                  <p>The installed tool contract says the first read may request design-system access for your claude.ai login. Follow any authorization error’s instructions; <code>/design-login</code> is the dedicated authorization path described by this version. A previous successful sync does not prove the current session is authorized.</p>
                </div></details></li>
                <li><details><summary>Choose the target project <span>Your input</span></summary><div>
                  <p>Choose a writable design-system project by its ID. The checked-in configuration targets <strong>Todoi Design System</strong>, <code>13419b94-fc55-494b-8a6d-e08632bb71e0</code>; the app’s footer shows the current target.</p>
                  <p>The original notes mention an older project with the same name, ID prefix <code>949de2c1…</code>. Its current existence and age have not been verified online. Names alone are not enough to identify a target.</p>
                  <p>Creating a project has a separate permission prompt in the inspected contract. For an experiment, create a new <em>design-system</em> project, for example “Todoi · Storybook trial”; an ordinary project does not become a design system just by receiving these files.</p>
                </div></details></li>
                <li><details><summary>Identify the source: Storybook <span>Automatic</span></summary><div>
                  <p>This repo has <code>.storybook/main.ts</code> and five component story files: Button, TextField, Dialog, Select and ItemCard. They provide a Storybook source for the converter. The package route described in the original article instead uses a package’s built <code>dist/</code> output.</p>
                  <p>The original walkthrough reports discovery of <code>.storybook/main.*</code> up to four folders deep; that exact search limit is not confirmed by public documentation. Do not treat it as a setup requirement.</p>
                  <p>At review time, <code>src/client/design</code> contains 93 TSX files excluding stories and tests. That is a file count, not 93 distinct components. Five stories leave much of the design system without explicit preview coverage.</p>
                </div></details></li>
                <li><details><summary>Bundle components and generate previews <span>Local files</span></summary><div>
                  <p>The installed converter includes <code>_ds_bundle.js</code> and wrappers that import story modules. The wrapper brings along story-local helpers and fixtures while resolving component imports to the shipped bundle.</p>
                  <ul>
                    <li><code>.design-sync/.cache/previews/&lt;Name&gt;.tsx</code> holds generated wrappers.</li>
                    <li><code>.design-sync/previews/&lt;Name&gt;.tsx</code> holds owned overrides. The installed source says to copy the generated wrapper and remove its ownership-marker first line; owned copies take precedence and survive re-syncs.</li>
                    <li><code>.design-sync/config.json</code> holds converter settings, including component selection and provider configuration described by the original walkthrough.</li>
                  </ul>
                  <p>Expect local generated files before upload approval. Review <code>git status</code> and the diff: the upload boundary does not constrain every file operation Claude Code might perform while fixing a build.</p>
                </div></details></li>
                <li><details><summary>Render and inspect the cards <span>Automatic</span></summary><div>
                  <p>The original walkthrough describes Chromium checks for crashes (“bad”), nearly empty renders (“thin”), and variants that look identical, followed by config fixes and rebuilds. Those labels and the exact loop are not documented public guarantees.</p>
                  <p>This repo’s <code>.storybook/preview.tsx</code> sets appearance and viewport behavior, imports design styles, and provides theme × mode globals. A standalone preview needs equivalent context. Missing styles or providers can cause incorrect output or runtime errors. Storybook documents decorators as the mechanism for supplying rendering context. <a href={SOURCES.decorators}>Storybook decorators</a>.</p>
                  <p>The installed converter contains a Storybook probe that suggests a <code>provider</code> setting. Inspect Rounded and Minimal in light and dark, and exercise interactions; a successful render alone does not establish fidelity. Keep production React, Base UI behavior and state architecture authoritative.</p>
                </div></details></li>
                <li><details><summary>Read Design and prepare the plan <span>Automatic</span></summary><div>
                  <p>The tool lists project files and can read individual contents for comparison. Its installed contract calls for incremental component updates, not wholesale replacement. Review proposed additions, updates and any deletes against the live project.</p>
                  <p>A generated bundle does not imply that every existing file must be replaced. Check actual path overlap, especially in the hand-written kit.</p>
                </div></details></li>
                <li><details open><summary>Review the exact upload plan <span>Your input</span></summary><div>
                  <p>In the inspected contract, <code>finalize_plan</code> locks the write paths, delete paths and source directory. Its permission prompt shows that structured list independently of the assistant’s explanation.</p>
                  <pre aria-label="Illustrative upload approval">{`DesignSync · finalize_plan\nTo project    Todoi Design System (13419b94…)\nFrom folder   /path/to/todoi-react/.design-sync/…\nUpload        n files: _ds_bundle.js, previews/…\nDelete        m files\n\nYes / No`}</pre>
                  <p className="cds-quiet">Illustration only. Actual paths, counts and wording depend on the run.</p>
                  <p>Check the project ID, every upload that overlaps kit paths, and every deletion. Files under <code>components/**</code>, <code>tokens/**</code> and <code>readme.md</code> may contain hand-written work. Decline an unexpected plan and retarget it.</p>
                  <p>Declining stops that plan’s upload; it does not undo generated local files or a separately approved project creation. Permission behavior also depends on the tool and session configuration. <a href={SOURCES.permissions}>Claude Code permissions</a>.</p>
                </div></details></li>
                <li><details><summary>Upload approved files <span>Automatic</span></summary><div>
                  <p>The 2.1.285 contract permits up to 256 files per <code>write_files</code> call under the same plan. Disk uploads use <code>localPath</code> inside the approved directory, so that transport need not put file contents into the conversation; small inline <code>data</code> is also supported. This is not a promise that Claude never reads those files elsewhere.</p>
                  <p>Write and delete paths outside the finalized plan are rejected. Preview HTML can carry a first-line <code>{'<!-- @dsCard group="…" -->'}</code> marker; the Design app’s self-check compiles its card index into <code>_ds_manifest.json</code>. These are installed-version details.</p>
                </div></details></li>
                <li><details><summary>Open the project and review local changes <span>Your input</span></summary><div>
                  <p>Use the returned <code>claude.ai/design/p/&lt;id&gt;</code> link and inspect the cards. Decide which <code>.design-sync/</code> configuration or owned previews to keep in git, and which generated artifacts to ignore or remove. Follow this repository’s requirement to commit completed features.</p>
                  <p>If the live kit changed outside this app, check for changes and pull before comparing or marking anything synced.</p>
                </div></details></li>
              </ol>
            </section>

            <section id="risks">
              <h3>What could go wrong in this repo</h3>
              <p>Highest impact first.</p>
              <dl>
                <dt>Hand-written kit files are overwritten</dt>
                <dd>The kit includes JSX, <code>.d.ts</code> contracts, <code>.prompt.md</code> notes, HTML cards, Minimal twins and a long <code>readme.md</code> spec. Generated files can replace work when paths overlap; deletes can remove it. Use a separate trial project and inspect both writes and deletes.</dd>
                <dt>This app’s baseline falls behind</dt>
                <dd>An external upload skips local snapshots and sync points. After a pull, mapped changes can appear as Design work or “changed on both.” Configuration ignores <code>_ds_bundle.js</code> and <code>_ds_manifest.json</code>; generated cards and components are not universally ignored. Unmapped paths may not appear as features, so also review the project inventory.</dd>
                <dt>Preview coverage stays thin</dt>
                <dd>Five story files cover only a slice of the library. Board, list, overlay, navigation, settings and calendar coverage remains limited. Add representative states and interactions as needed; this app’s port briefs already use stories as context.</dd>
                <dt>Cards lose appearance or behavior</dt>
                <dd>Theme, mode, CSS, fonts and rendering context must reach the preview. Fix the wrapper or converter configuration when they do not. Storybook’s global decorators are a useful reference, not proof that an external renderer reproduces them. <a href={SOURCES.decorators}>Decorator scope and inheritance</a>.</dd>
                <dt>Generated files linger in the working tree</dt>
                <dd>Inspect the new <code>.design-sync/</code> folder. Deliberately retain reusable configuration and previews, and ignore or remove disposable output. Do not commit everything just because it was generated.</dd>
              </dl>
            </section>

            <section id="answers">
              <h3>Quick answers</h3>
              <dl>
                <dt>Can it change my React code?</dt>
                <dd>The converter workflow writes generated output under <code>.design-sync/</code>. Claude Code can still edit source during troubleshooting if permitted. Review the diff; “it cannot change React code” is too strong. <a href={SOURCES.permissions}>Permission controls</a>.</dd>
                <dt>Can it pull Design edits into the app?</dt>
                <dd>The slash-command workflow described here pushes code into Design. Use this app’s “Into the App” direction for reviewed ports back to React.</dd>
                <dt>Can anything upload without me seeing it?</dt>
                <dd>The inspected DesignSync contract requires a finalized plan with exact paths. Use the interactive approval flow and inspect its list; this is a statement about this tool version, not every upload mechanism or permission configuration.</dd>
                <dt>Can I run it from the GUI or a subagent?</dt>
                <dd>This GUI prepares an upload request for your interactive Claude Code session. The original article says subagents do not receive DesignSync; that restriction was not independently established here. Do not rely on a delegated upload path without checking your installed version.</dd>
                <dt>Is it safe against the live kit?</dt>
                <dd>No deletes and no overlapping writes reduce the risk, but generated manifests, imports and styles can still affect behavior. A separate trial project is the recommended first test; then inspect and port useful changes deliberately.</dd>
              </dl>
            </section>

            <section id="recommendations">
              <h3>What to do</h3>
              <ol className="cds-guide-recommendations">
                <li><h4>Keep this app for real syncs</h4><p>Run <code>npm run design-sync -- serve</code> → Check for changes → pull if needed → Review selected sync steps → run → Merge App work when ready → prepare Upload from Activity → paste the request into Claude Code and approve → Check the upload → Mark selected features synced. Only perform steps relevant to your chosen direction.</p></li>
                <li><h4>Try the slash command in a new project</h4><p>Create “Todoi · Storybook trial” as a design-system project. Compare generated previews with the hand-written kit, including interactions and all four theme/mode combinations. Port useful parts after review.</p></li>
                <li><h4>Decline an unexpected live-kit plan</h4><p>If the target is Todoi Design System and the plan deletes or unexpectedly overwrites kit files, answer No and ask Claude to retarget. That prevents this plan’s upload; earlier local generation and project creation may already have happened.</p></li>
              </ol>
            </section>

            <section id="sources">
              <h3>Sources & qualifications</h3>
              <p>Adapted from the supplied <code>20261006_demo_design-sync.html</code>. Online documentation and repository state were checked on 6 October 2026. This is a dated guide, not a live audit of your Claude account.</p>
              <ul className="cds-guide-sources">
                <li><a href={SOURCES.setup}>Anthropic: Set up your design system</a> — public support for importing React components and tokens with <code>/design-sync</code>.</li>
                <li><a href={SOURCES.headless}>Anthropic: Run Claude Code programmatically</a> — establishes that non-interactive execution and tool approval integrations exist; does not establish DesignSync’s availability in every context.</li>
                <li><a href={SOURCES.permissions}>Anthropic: Configure permissions</a> — permission modes and tool access; supports qualifying absolute claims about local edits and prompts.</li>
                <li><a href={SOURCES.decorators}>Storybook: Decorators</a> — rendering wrappers, global context and inheritance; supports the need to preserve preview context.</li>
                <li><strong>Installed primary source:</strong> <code>@anthropic-ai/claude-code</code> 2.1.285, bundled DesignSync contract and converter source. Inspected locally for project authorization, incremental updates, finalized path lists, disk/inline uploads, the 256-file limit, card markers, owned preview wrappers and the provider probe. These details are not promised by the public pages above.</li>
                <li><strong>Repository evidence:</strong> <code>.storybook/main.ts</code>, <code>.storybook/preview.tsx</code>, the five <code>*.stories.tsx</code> files, and <code>tools/claude-design-sync/README.md</code>, <code>config.json</code> and upload implementation. Counts and target IDs describe the reviewed checkout.</li>
              </ul>
              <p>The four-folder discovery limit, exact validation labels, historical duplicate project and subagent restriction remain attributed to the original article. The recommendations are engineering judgments based on this kit’s structure. No trial upload was performed for this guide.</p>
              <a className="cds-link" href="/">Back to the sync plan</a>
            </section>
          </article>
        </div>
      </main>
    </div>
  );
}
