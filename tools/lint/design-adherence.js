// Design-system adherence rules for oxlint (JS plugin, ESLint-compatible API).
// Ported from the export's `_adherence.oxlintrc.json`: component code consumes tokens only.
// Enabled in .oxlintrc.json under `jsPlugins`; prop contracts are enforced by TypeScript instead.

const HEX = /^#[0-9a-fA-F]{3,8}$/;
const PX = /\b\d+px\b/;

/** Is this node inside a JSX `style={…}` attribute? */
function inStyleAttribute(node) {
  let n = node.parent;
  while (n) {
    if (n.type === "JSXAttribute") return n.name && n.name.name === "style";
    n = n.parent;
  }
  return false;
}

const noRawHex = {
  meta: {
    type: "problem",
    docs: { description: "Disallow raw hex colours in client code; use a token (var(--…)) in CSS or the theme registry." },
  },
  create(context) {
    const check = (node, value) => {
      if (typeof value === "string" && HEX.test(value.trim())) {
        context.report({ node, message: `Raw hex colour "${value}" — use a design-system token (var(--…)) in CSS.` });
      }
    };
    return {
      Literal(node) {
        check(node, node.value);
      },
      TemplateElement(node) {
        if (node.value && HEX.test((node.value.cooked ?? "").trim())) check(node, node.value.cooked);
      },
    };
  },
};

const noInlinePx = {
  meta: {
    type: "problem",
    docs: { description: "Disallow raw px values in inline styles; put the rule in the component's .css file with tokens." },
  },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value === "string" && PX.test(node.value) && inStyleAttribute(node)) {
          context.report({ node, message: `Raw px in an inline style ("${node.value}") — move it to the component's .css file with tokens.` });
        }
      },
    };
  },
};

const noInlineZIndex = {
  meta: { type: "problem", docs: { description: "Disallow z-index in inline styles; use the --z-* ladder in CSS." } },
  create(context) {
    return {
      Property(node) {
        const key = node.key && (node.key.name || node.key.value);
        if (key === "zIndex" && inStyleAttribute(node)) {
          context.report({ node, message: "Raw z-index — use the --z-* stacking ladder (tokens/elevation.css) in CSS." });
        }
      },
    };
  },
};

const noInlineFontFamily = {
  meta: { type: "problem", docs: { description: "Disallow font-family in inline styles; fonts are tokens (--font-ui / --font-mono)." } },
  create(context) {
    return {
      Property(node) {
        const key = node.key && (node.key.name || node.key.value);
        if (key === "fontFamily" && inStyleAttribute(node)) {
          context.report({ node, message: "Font family is a token (--font-ui / --font-mono); set it in CSS, never inline." });
        }
      },
    };
  },
};

export default {
  meta: { name: "design" },
  rules: {
    "no-raw-hex": noRawHex,
    "no-inline-px": noInlinePx,
    "no-inline-z-index": noInlineZIndex,
    "no-inline-font-family": noInlineFontFamily,
  },
};
