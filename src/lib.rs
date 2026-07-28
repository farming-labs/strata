mod renderer;

use napi_derive::napi;

pub use renderer::{RenderError, RenderOptions, RenderedFragment, render_document_json};

#[napi(object)]
pub struct NativeRenderResult {
    pub html: String,
    pub hash: String,
    pub node_count: u32,
    pub bytes: u32,
}

#[napi(js_name = "renderJson")]
pub fn render_json(
    document_json: String,
    options_json: Option<String>,
) -> napi::Result<NativeRenderResult> {
    let options = options_json
        .as_deref()
        .map(serde_json::from_str::<RenderOptions>)
        .transpose()
        .map_err(|error| napi::Error::from_reason(format!("invalid render options: {error}")))?
        .unwrap_or_default();

    let rendered = render_document_json(&document_json, &options)
        .map_err(|error| napi::Error::from_reason(error.to_string()))?;

    Ok(NativeRenderResult {
        html: rendered.html,
        hash: rendered.hash,
        node_count: rendered.node_count,
        bytes: rendered.bytes,
    })
}
