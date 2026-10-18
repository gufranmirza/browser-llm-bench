"""Pin browser packages from installed WebLLM catalogs; never download model weights.
Catalog inputs come from the two installed, version-locked JS packages.
"""

import json, hashlib, urllib.request, concurrent.futures, re, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def get(url):
    with urllib.request.urlopen(
        urllib.request.Request(
            url, headers={"User-Agent": "browser-inference-bench-catalog"}
        ),
        timeout=45,
    ) as r:
        return r.read()


def js(url):
    return json.loads(get(url))


catalog = json.loads((ROOT / "catalog/models.json").read_text())
live = {
    "models": [m for m in catalog["models"] if m["validationStatus"] == "benchmarked"]
}
research = json.loads((ROOT / "catalog/research/model-candidates.json").read_text())
newart = json.loads((ROOT / "catalog/research/webllm-artifacts.json").read_text())[
    "artifacts"
]


def installed(pkg):
    return json.loads(
        subprocess.check_output(
            ["node", "scripts/extract-webllm-catalog.mjs", pkg], cwd=ROOT
        )
    )["model_list"]


old = installed("web-llm")
new = installed("web-llm-next")
base = {re.sub(r"-q\df\d+(?:_\d)?-MLC$", "", m["id"]): m for m in live["models"]}
# Models already offered by the site also get their actual published encodings.
extra = {
    "SmolLM2-1.7B-Instruct": (
        "SmolLM2 1.7B",
        "smollm2-1-7b",
        "Hugging Face",
        1.7,
        "HuggingFaceTB/SmolLM2-1.7B-Instruct",
    ),
    "gemma-2-2b-it": ("Gemma 2 2B", "gemma-2-2b", "Google", 2, "google/gemma-2-2b-it"),
}
for prefix, (name, slug, family, size, repo) in extra.items():
    base[prefix] = dict(
        name=name,
        slug=slug,
        family=family,
        parameters=size,
        card="https://huggingface.co/" + repo,
        thinkingDisabled=False,
    )
existing = {m["id"] for m in live["models"]}
tasks = []
for record in old:
    prefix = re.sub(r"-q\df\d+(?:_\d)?-MLC$", "", record["model_id"])
    if prefix in base and record["model_id"] not in existing:
        tasks.append((record, base[prefix], "0.2.82", None))
for a in newart:
    r = next(m for m in new if m["model_id"] == a["id"])
    c = next(m for m in research["models"] if m["name"] == a["name"])
    meta = dict(
        name=c["name"],
        slug=re.sub("[^a-z0-9]+", "-", c["name"].lower()).strip("-"),
        family=c["creator"],
        parameters=c["total_parameters_b"],
        card=c["checkpoint_url"],
        thinkingDisabled=a["id"].startswith("Qwen3"),
    )
    tasks.append((r, meta, "0.2.86", a["revision"]))
librev = js("https://api.github.com/repos/mlc-ai/binary-mlc-llm-libs/commits/main")[
    "sha"
]


def build(task):
    record, meta, version, revision = task
    record = record.copy()
    repo = record["model"].split("huggingface.co/")[1].strip("/")
    revision = revision or js("https://huggingface.co/api/models/" + repo)["sha"]
    url = f"https://huggingface.co/{repo}/resolve/{revision}/"
    package = (
        js(url + record["model_manifest"]) if record.get("model_manifest") else None
    )
    manifest_name = (
        package["weights"]["manifest"]
        if package
        else ("tensor-cache.json" if version == "0.2.86" else "ndarray-cache.json")
    )
    try:
        raw = get(url + manifest_name)
    except urllib.error.HTTPError:
        manifest_name = "ndarray-cache.json"
        raw = get(url + manifest_name)
    manifest = json.loads(raw)
    config = get(url + "mlc-chat-config.json")
    entries = manifest.get("records", [])
    weight = sum(x["nbytes"] for x in entries)
    # New tensor cache uses files rather than ndarray records.
    if not entries:
        info = js("https://huggingface.co/api/models/" + repo + "?blobs=true")
        files = [x for x in info["siblings"] if x["rfilename"].endswith(".bin")]
        weight = sum(x["size"] for x in files)
        shards = len(files)
    else:
        shards = len(entries)
    assert weight > 0, (repo, manifest.keys())
    lib = record["model_lib"].replace("/main/", f"/{librev}/")
    with urllib.request.urlopen(
        urllib.request.Request(lib, method="HEAD"), timeout=45
    ) as response:
        assert response.status == 200
    record.update(model=url, model_lib=lib)
    quant = re.search(r"-(q\df\d+(?:_\d)?)-MLC$", record["model_id"])[1]
    result = {
        k: meta[k]
        for k in ["name", "slug", "family", "parameters", "card", "thinkingDisabled"]
    }
    result.update(
        id=record["model_id"],
        runtime="WebLLM " + version,
        modelUrl=url,
        revision=revision,
        modelLib=lib,
        modelLibRevision=librev,
        quantization=quant,
        weightShardBytes=weight,
        estimatedVramMB=record.get("vram_required_MB"),
        requiredFeatures=["shader-f16"]
        if "f16" in quant
        else record.get("required_features", []),
        bufferSizeRequiredBytes=record.get("buffer_size_required_bytes", 0),
        contextWindow=4096,
        chatConfigSha256=hashlib.sha256(config).hexdigest(),
        record=record,
        validationStatus="package-verified",
        artifact=dict(
            manifestUrl=url + manifest_name,
            manifestSha256=hashlib.sha256(raw).hexdigest(),
            weightShardBytes=weight,
            shards=shards,
            nominalParameters=round(meta["parameters"] * 1e9),
            theoreticalFP16Bytes=round(meta["parameters"] * 2e9),
        ),
    )
    print("Pinned", result["id"], flush=True)
    return result


with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
    models = list(pool.map(build, tasks))
(ROOT / "catalog/models.json").write_text(
    json.dumps({"models": live["models"] + models}, indent=2) + "\n"
)
# Keep research details out of the application bundle; only selection metadata is needed.
candidates = [
    dict(
        name=m["name"],
        family=m["creator"],
        parameters=m["total_parameters_b"],
        card=m["checkpoint_url"],
        artifactIds=[a["id"] for a in m["webllm_artifacts"]],
        gguf=m["gguf_quantizations_observed"],
        onnx=bool(m["onnx_artifacts"]),
    )
    for m in research["models"]
    if m["eligible"]
]
(ROOT / "catalog/candidates.json").write_text(json.dumps(candidates, indent=2) + "\n")
print("Added", len(models), "artifacts;", len(candidates), "research candidates")
