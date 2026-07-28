use std::collections::BTreeMap;

use serde::Deserialize;
use thiserror::Error;

const DEFAULT_MAX_DEPTH: usize = 128;
const DEFAULT_MAX_NODES: usize = 100_000;
const DEFAULT_MAX_OUTPUT_BYTES: usize = 16 * 1024 * 1024;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RenderOptions {
    #[serde(default = "default_max_depth")]
    pub max_depth: usize,
    #[serde(default = "default_max_nodes")]
    pub max_nodes: usize,
    #[serde(default = "default_max_output_bytes")]
    pub max_output_bytes: usize,
}

impl Default for RenderOptions {
    fn default() -> Self {
        Self {
            max_depth: DEFAULT_MAX_DEPTH,
            max_nodes: DEFAULT_MAX_NODES,
            max_output_bytes: DEFAULT_MAX_OUTPUT_BYTES,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenderedFragment {
    pub html: String,
    pub hash: String,
    pub node_count: u32,
    pub bytes: u32,
}

#[derive(Debug, Error)]
pub enum RenderError {
    #[error("invalid document: {0}")]
    InvalidDocument(#[from] serde_json::Error),

    #[error("unsupported element <{0}>")]
    UnsupportedElement(String),

    #[error("attribute \"{attribute}\" is not allowed on <{tag}>")]
    UnsupportedAttribute { tag: String, attribute: String },

    #[error("unsafe URL in \"{attribute}\" on <{tag}>")]
    UnsafeUrl { tag: String, attribute: String },

    #[error("invalid value for \"target\" on <a>")]
    InvalidTarget,

    #[error("control characters are not allowed in attribute \"{attribute}\"")]
    InvalidAttributeValue { attribute: String },

    #[error("void element <{0}> cannot have children")]
    VoidElementChildren(String),

    #[error("maximum render depth of {0} exceeded")]
    MaximumDepth(usize),

    #[error("maximum node count of {0} exceeded")]
    MaximumNodes(usize),

    #[error("maximum output size of {0} bytes exceeded")]
    MaximumOutputBytes(usize),

    #[error("rendered output is too large to describe")]
    OutputTooLarge,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Document {
    #[serde(rename = "type")]
    node_type: DocumentType,
    #[serde(default)]
    children: Vec<Node>,
}

#[derive(Debug, Deserialize)]
enum DocumentType {
    #[serde(rename = "document")]
    Document,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case", deny_unknown_fields)]
enum Node {
    Text {
        value: String,
    },
    Element {
        tag: String,
        #[serde(default)]
        attributes: BTreeMap<String, String>,
        #[serde(default)]
        children: Vec<Node>,
    },
}

struct RenderState<'a> {
    options: &'a RenderOptions,
    node_count: usize,
}

pub fn render_document_json(
    document_json: &str,
    options: &RenderOptions,
) -> Result<RenderedFragment, RenderError> {
    let document: Document = serde_json::from_str(document_json)?;
    let _document_type = document.node_type;

    let mut state = RenderState {
        options,
        node_count: 0,
    };
    let mut html = String::new();

    for node in &document.children {
        render_node(node, 1, &mut state, &mut html)?;
    }

    let bytes = u32::try_from(html.len()).map_err(|_| RenderError::OutputTooLarge)?;
    let node_count = u32::try_from(state.node_count).map_err(|_| RenderError::OutputTooLarge)?;
    let hash = blake3::hash(html.as_bytes()).to_hex().to_string();

    Ok(RenderedFragment {
        html,
        hash,
        node_count,
        bytes,
    })
}

fn render_node(
    node: &Node,
    depth: usize,
    state: &mut RenderState<'_>,
    html: &mut String,
) -> Result<(), RenderError> {
    if depth > state.options.max_depth {
        return Err(RenderError::MaximumDepth(state.options.max_depth));
    }

    state.node_count += 1;
    if state.node_count > state.options.max_nodes {
        return Err(RenderError::MaximumNodes(state.options.max_nodes));
    }

    match node {
        Node::Text { value } => {
            escape_text(value, html, state.options.max_output_bytes)?;
        }
        Node::Element {
            tag,
            attributes,
            children,
        } => {
            if !is_allowed_element(tag) {
                return Err(RenderError::UnsupportedElement(tag.clone()));
            }

            push_limited(html, "<", state.options.max_output_bytes)?;
            push_limited(html, tag, state.options.max_output_bytes)?;
            render_attributes(tag, attributes, html, state.options.max_output_bytes)?;
            push_limited(html, ">", state.options.max_output_bytes)?;

            if is_void_element(tag) {
                if !children.is_empty() {
                    return Err(RenderError::VoidElementChildren(tag.clone()));
                }
                return Ok(());
            }

            for child in children {
                render_node(child, depth + 1, state, html)?;
            }

            push_limited(html, "</", state.options.max_output_bytes)?;
            push_limited(html, tag, state.options.max_output_bytes)?;
            push_limited(html, ">", state.options.max_output_bytes)?;
        }
    }

    if html.len() > state.options.max_output_bytes {
        return Err(RenderError::MaximumOutputBytes(
            state.options.max_output_bytes,
        ));
    }

    Ok(())
}

fn render_attributes(
    tag: &str,
    attributes: &BTreeMap<String, String>,
    html: &mut String,
    max_output_bytes: usize,
) -> Result<(), RenderError> {
    let mut effective_attributes = attributes.clone();
    let opens_new_context = effective_attributes
        .get("target")
        .is_some_and(|target| target == "_blank");
    if tag == "a" && opens_new_context {
        let rel = effective_attributes.entry("rel".to_string()).or_default();
        let has_noopener = rel
            .split_ascii_whitespace()
            .any(|token| token == "noopener");
        let has_noreferrer = rel
            .split_ascii_whitespace()
            .any(|token| token == "noreferrer");
        if !has_noopener {
            if !rel.is_empty() {
                rel.push(' ');
            }
            rel.push_str("noopener");
        }
        if !has_noreferrer {
            if !rel.is_empty() {
                rel.push(' ');
            }
            rel.push_str("noreferrer");
        }
    }

    for (name, value) in effective_attributes {
        if !is_allowed_attribute(tag, &name) {
            return Err(RenderError::UnsupportedAttribute {
                tag: tag.to_string(),
                attribute: name,
            });
        }

        if value.chars().any(char::is_control) {
            return Err(RenderError::InvalidAttributeValue { attribute: name });
        }

        if tag == "a"
            && name == "target"
            && !matches!(value.as_str(), "_blank" | "_self" | "_parent" | "_top")
        {
            return Err(RenderError::InvalidTarget);
        }

        if is_url_attribute(tag, &name) && !is_safe_url(&value) {
            return Err(RenderError::UnsafeUrl {
                tag: tag.to_string(),
                attribute: name,
            });
        }

        push_limited(html, " ", max_output_bytes)?;
        push_limited(html, &name, max_output_bytes)?;
        push_limited(html, "=\"", max_output_bytes)?;
        escape_attribute(&value, html, max_output_bytes)?;
        push_limited(html, "\"", max_output_bytes)?;
    }

    Ok(())
}

fn escape_text(value: &str, html: &mut String, max_output_bytes: usize) -> Result<(), RenderError> {
    for character in value.chars() {
        match character {
            '&' => push_limited(html, "&amp;", max_output_bytes)?,
            '<' => push_limited(html, "&lt;", max_output_bytes)?,
            '>' => push_limited(html, "&gt;", max_output_bytes)?,
            _ => push_character_limited(html, character, max_output_bytes)?,
        }
    }
    Ok(())
}

fn escape_attribute(
    value: &str,
    html: &mut String,
    max_output_bytes: usize,
) -> Result<(), RenderError> {
    for character in value.chars() {
        match character {
            '&' => push_limited(html, "&amp;", max_output_bytes)?,
            '<' => push_limited(html, "&lt;", max_output_bytes)?,
            '>' => push_limited(html, "&gt;", max_output_bytes)?,
            '"' => push_limited(html, "&quot;", max_output_bytes)?,
            '\'' => push_limited(html, "&#39;", max_output_bytes)?,
            _ => push_character_limited(html, character, max_output_bytes)?,
        }
    }
    Ok(())
}

fn push_limited(
    html: &mut String,
    value: &str,
    max_output_bytes: usize,
) -> Result<(), RenderError> {
    if html.len().saturating_add(value.len()) > max_output_bytes {
        return Err(RenderError::MaximumOutputBytes(max_output_bytes));
    }
    html.push_str(value);
    Ok(())
}

fn push_character_limited(
    html: &mut String,
    value: char,
    max_output_bytes: usize,
) -> Result<(), RenderError> {
    if html.len().saturating_add(value.len_utf8()) > max_output_bytes {
        return Err(RenderError::MaximumOutputBytes(max_output_bytes));
    }
    html.push(value);
    Ok(())
}

fn is_allowed_element(tag: &str) -> bool {
    matches!(
        tag,
        "a" | "abbr"
            | "address"
            | "article"
            | "aside"
            | "b"
            | "blockquote"
            | "br"
            | "caption"
            | "cite"
            | "code"
            | "col"
            | "colgroup"
            | "dd"
            | "del"
            | "details"
            | "dfn"
            | "div"
            | "dl"
            | "dt"
            | "em"
            | "figcaption"
            | "figure"
            | "footer"
            | "h1"
            | "h2"
            | "h3"
            | "h4"
            | "h5"
            | "h6"
            | "header"
            | "hr"
            | "i"
            | "img"
            | "ins"
            | "kbd"
            | "li"
            | "main"
            | "mark"
            | "nav"
            | "ol"
            | "p"
            | "pre"
            | "q"
            | "s"
            | "samp"
            | "section"
            | "small"
            | "span"
            | "strong"
            | "sub"
            | "summary"
            | "sup"
            | "table"
            | "tbody"
            | "td"
            | "tfoot"
            | "th"
            | "thead"
            | "time"
            | "tr"
            | "u"
            | "ul"
            | "var"
            | "wbr"
    )
}

fn is_void_element(tag: &str) -> bool {
    matches!(tag, "br" | "col" | "hr" | "img" | "wbr")
}

fn is_allowed_attribute(tag: &str, attribute: &str) -> bool {
    if matches!(
        attribute,
        "class" | "dir" | "hidden" | "id" | "lang" | "role" | "title"
    ) || is_prefixed_attribute(attribute, "aria-")
        || is_prefixed_attribute(attribute, "data-")
    {
        return true;
    }

    match tag {
        "a" => matches!(attribute, "href" | "rel" | "target"),
        "blockquote" | "del" | "ins" | "q" => attribute == "cite",
        "col" | "colgroup" => attribute == "span",
        "img" => matches!(
            attribute,
            "alt" | "decoding" | "height" | "loading" | "src" | "width"
        ),
        "li" => attribute == "value",
        "ol" => matches!(attribute, "reversed" | "start" | "type"),
        "td" => matches!(attribute, "colspan" | "headers" | "rowspan"),
        "th" => matches!(
            attribute,
            "abbr" | "colspan" | "headers" | "rowspan" | "scope"
        ),
        "time" => attribute == "datetime",
        _ => false,
    }
}

fn is_prefixed_attribute(attribute: &str, prefix: &str) -> bool {
    let Some(suffix) = attribute.strip_prefix(prefix) else {
        return false;
    };
    !suffix.is_empty()
        && suffix
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

fn is_url_attribute(tag: &str, attribute: &str) -> bool {
    matches!(
        (tag, attribute),
        ("a", "href") | ("blockquote" | "del" | "ins" | "q", "cite") | ("img", "src")
    )
}

fn is_safe_url(value: &str) -> bool {
    let value = value.trim();
    if value.is_empty()
        || value.starts_with('/')
        || value.starts_with("./")
        || value.starts_with("../")
        || value.starts_with('#')
        || value.starts_with('?')
    {
        return true;
    }

    let delimiter = value.find(['/', '?', '#']).unwrap_or(value.len());
    let Some(colon) = value.find(':') else {
        return true;
    };
    if colon > delimiter {
        return true;
    }

    matches!(
        value[..colon].to_ascii_lowercase().as_str(),
        "http" | "https" | "mailto" | "tel"
    )
}

const fn default_max_depth() -> usize {
    DEFAULT_MAX_DEPTH
}

const fn default_max_nodes() -> usize {
    DEFAULT_MAX_NODES
}

const fn default_max_output_bytes() -> usize {
    DEFAULT_MAX_OUTPUT_BYTES
}

#[cfg(test)]
mod tests {
    use super::*;

    fn render(document: &str) -> Result<RenderedFragment, RenderError> {
        render_document_json(document, &RenderOptions::default())
    }

    #[test]
    fn renders_deterministic_safe_html() {
        let document = r#"{
          "type": "document",
          "children": [{
            "type": "element",
            "tag": "article",
            "attributes": {"id": "intro", "class": "prose"},
            "children": [{
              "type": "element",
              "tag": "h1",
              "children": [{"type": "text", "value": "RSC & Rust"}]
            }, {
              "type": "element",
              "tag": "p",
              "children": [{"type": "text", "value": "<fast>"}]
            }]
          }]
        }"#;

        let first = render(document).expect("document should render");
        let second = render(document).expect("document should render");

        assert_eq!(
            first.html,
            r#"<article class="prose" id="intro"><h1>RSC &amp; Rust</h1><p>&lt;fast&gt;</p></article>"#
        );
        assert_eq!(first.hash, second.hash);
        assert_eq!(first.node_count, 5);
        assert_eq!(first.bytes as usize, first.html.len());
    }

    #[test]
    fn protects_blank_links() {
        let output = render(
            r#"{
              "type":"document",
              "children":[{
                "type":"element",
                "tag":"a",
                "attributes":{"target":"_blank","href":"https://example.com"},
                "children":[{"type":"text","value":"Example"}]
              }]
            }"#,
        )
        .expect("safe link should render");

        assert_eq!(
            output.html,
            r#"<a href="https://example.com" rel="noopener noreferrer" target="_blank">Example</a>"#
        );

        let explicit_rel = render(
            r#"{
              "type":"document",
              "children":[{
                "type":"element",
                "tag":"a",
                "attributes":{
                  "target":"_blank",
                  "rel":"nofollow",
                  "href":"https://example.com"
                }
              }]
            }"#,
        )
        .expect("blank link should be hardened");

        assert_eq!(
            explicit_rel.html,
            r#"<a href="https://example.com" rel="nofollow noopener noreferrer" target="_blank"></a>"#
        );
    }

    #[test]
    fn rejects_script_elements_and_event_handlers() {
        let script =
            render(r#"{"type":"document","children":[{"type":"element","tag":"script"}]}"#)
                .expect_err("script should be rejected");
        assert!(matches!(script, RenderError::UnsupportedElement(_)));

        let handler = render(
            r#"{
              "type":"document",
              "children":[{
                "type":"element",
                "tag":"div",
                "attributes":{"onclick":"alert(1)"}
              }]
            }"#,
        )
        .expect_err("event handler should be rejected");
        assert!(matches!(handler, RenderError::UnsupportedAttribute { .. }));
    }

    #[test]
    fn rejects_unsafe_urls() {
        let error = render(
            r#"{
              "type":"document",
              "children":[{
                "type":"element",
                "tag":"a",
                "attributes":{"href":"JaVaScRiPt:alert(1)"}
              }]
            }"#,
        )
        .expect_err("javascript URL should be rejected");

        assert!(matches!(error, RenderError::UnsafeUrl { .. }));
    }

    #[test]
    fn enforces_resource_limits() {
        let options = RenderOptions {
            max_depth: 1,
            max_nodes: 10,
            max_output_bytes: 1_000,
        };
        let error = render_document_json(
            r#"{
              "type":"document",
              "children":[{
                "type":"element",
                "tag":"div",
                "children":[{"type":"text","value":"too deep"}]
              }]
            }"#,
            &options,
        )
        .expect_err("depth limit should be enforced");

        assert!(matches!(error, RenderError::MaximumDepth(1)));

        let output_error = render_document_json(
            r#"{
              "type":"document",
              "children":[{"type":"text","value":"&&"}]
            }"#,
            &RenderOptions {
                max_depth: 1,
                max_nodes: 10,
                max_output_bytes: 9,
            },
        )
        .expect_err("escaped output must respect the byte limit");

        assert!(matches!(output_error, RenderError::MaximumOutputBytes(9)));
    }
}
