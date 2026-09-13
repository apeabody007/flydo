"""Pull this fly's real mushroom body wiring into src/wiring.js.

Uses the Male CNS connectome (v1.0, CC-BY 4.0): its neuron annotations (~14 MB) and its full
connection list (~1 GB, downloaded on first run). It keeps only what the game needs:

- the visual Kenyon cells (KCg-d and KCab-p) on each side of the brain
- their visual inputs: annotated neurons making at least 3 synapses onto them, leaving out other
  Kenyon cells, dopamine neurons, output neurons, APL, DPM, octopamine neurons and olfactory cells
- their outputs onto mushroom body output neurons (MBONs), sorted by which dopamine neurons
  innervate each MBON: mostly PPL1 (punishment) means a zap retrains it, so it pulls the fly
  toward approaching; mostly PAM (reward) means sugar retrains it, so it pulls toward avoiding

What each input neuron "sees" is the one simplified part: each reports one of four features
(brightness, darkness, horizontal or vertical stripes) from one small patch of its eye, picked
per neuron. In testing, giving neurons wide fields of view blurred the Kenyon cell codes (66% of
rounds found vs 99%), and choosing features from type names didn't help.

    pip install pandas pyarrow
    python scripts/extract_wiring.py
"""
import json
import pathlib
import urllib.request
import zlib

import pandas as pd

BASE = "https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/"
ROOT = pathlib.Path(__file__).resolve().parent.parent
ANNOTATIONS = ROOT / "scripts" / "body-annotations-male-cns-v1.0-minconf-0.5.feather"
WEIGHTS = ROOT / "scripts" / "connectome-weights-male-cns-v1.0-minconf-0.5.feather"
OUT = ROOT / "src" / "wiring.js"

VISUAL_KC_TYPES = ("KCg-d", "KCab-p")
MIN_SYNAPSES = 3
NOT_VISUAL_CLASSES = {"Kenyon_Cell", "DAN", "MBON", "ALPN", "ALLN", "ALIN", "ALON"}
FEATURES = ["bright", "dark", "horizontal stripes", "vertical stripes"]
REGIONS = 12  # the patch under the fly is split into 6 rows x 2 columns per eye (src/eye.js)


def fetch(path):
    if not path.exists():
        print(f"Downloading {path.name} ...")
        urllib.request.urlretrieve(BASE + path.name, path)
    return pd.read_feather(path)


def receptive_field(body):
    """The simplified part: one feature, from one small patch of the neuron's eye."""
    pick = zlib.crc32(str(body).encode())
    return pick % len(FEATURES), (pick // len(FEATURES)) % REGIONS


def main():
    annotations = fetch(ANNOTATIONS)
    neurons = annotations[annotations["superclass"].notna()].drop_duplicates("bodyId").set_index("bodyId")
    weights = fetch(WEIGHTS)

    kcs = neurons[neurons["type"].isin(VISUAL_KC_TYPES)]
    into_kcs = weights[weights["body_post"].isin(kcs.index) & (weights["weight"] >= MIN_SYNAPSES)]
    into_kcs = into_kcs.join(neurons[["type", "class", "somaSide"]].add_prefix("pre_"), on="body_pre")
    visual = into_kcs[
        into_kcs["pre_type"].notna()
        & ~into_kcs["pre_class"].isin(NOT_VISUAL_CLASSES)
        & ~into_kcs["pre_type"].isin(["APL", "DPM"])
        & ~into_kcs["pre_type"].astype(str).str.startswith("OA-")
    ]

    # Sort MBONs into approach and avoid by the dopamine neurons that innervate them.
    dans = neurons[neurons["class"] == "DAN"]
    mbons = neurons[neurons["class"] == "MBON"]
    dan_to_mbon = weights[weights["body_pre"].isin(dans.index) & weights["body_post"].isin(mbons.index)]
    dan_to_mbon = dan_to_mbon.join(dans["type"].astype(str).rename("dan_type"), on="body_pre")
    punish = dan_to_mbon[dan_to_mbon["dan_type"].str.startswith("PPL1")].groupby("body_post")["weight"].sum()
    reward = dan_to_mbon[dan_to_mbon["dan_type"].str.startswith("PAM")].groupby("body_post")["weight"].sum()
    dopamine = pd.DataFrame({"punish": punish, "reward": reward}).fillna(0)
    dopamine["share_punish"] = dopamine["punish"] / (dopamine["punish"] + dopamine["reward"])
    enough = (dopamine["punish"] + dopamine["reward"]) >= 20
    approach_mbons = set(dopamine.index[enough & (dopamine["share_punish"] >= 0.8)])
    avoid_mbons = set(dopamine.index[enough & (dopamine["share_punish"] <= 0.2)])

    out_of_kcs = weights[weights["body_pre"].isin(kcs.index)]
    to_approach = out_of_kcs[out_of_kcs["body_post"].isin(approach_mbons)].groupby("body_pre")["weight"].sum()
    to_avoid = out_of_kcs[out_of_kcs["body_post"].isin(avoid_mbons)].groupby("body_pre")["weight"].sum()

    # Input neurons: which eye feeds them, and what they report.
    per_side = visual.join(kcs["somaSide"].rename("kc_side"), on="body_post")
    inputs = []
    index = {}
    for body, rows in per_side.groupby("body_pre"):
        side = rows["pre_somaSide"].iloc[0]
        if side not in ("L", "R"):
            side = rows.groupby("kc_side")["weight"].sum().idxmax()
        index[body] = len(inputs)
        feature, region = receptive_field(body)
        inputs.append({
            "id": int(body),
            "type": str(rows["pre_type"].iloc[0]),
            "eye": 0 if side == "L" else 1,
            "feature": feature,
            "region": region,
        })

    sides = {}
    for name, code in (("left", "L"), ("right", "R")):
        cells = []
        for body, kc in kcs[kcs["somaSide"] == code].sort_index().iterrows():
            synapses = visual[visual["body_post"] == body]
            cells.append({
                "id": int(body),
                "type": kc["type"],
                "inputs": [[index[int(b)], int(w)] for b, w in zip(synapses["body_pre"], synapses["weight"])],
                "approach": int(to_approach.get(body, 0)),
                "avoid": int(to_avoid.get(body, 0)),
            })
        sides[name] = cells

    all_cells = sides["left"] + sides["right"]
    stats = {
        "visualKenyonCells": len(all_cells),
        "inputNeurons": len(inputs),
        "inputTypes": len({i["type"] for i in inputs}),
        "inputSynapses": int(visual["weight"].sum()),
        "medianInputsPerCell": float(pd.Series([len(c["inputs"]) for c in all_cells]).median()),
        "cellsWithoutVisualInput": sum(1 for c in all_cells if not c["inputs"]),
        "approachMbons": len(approach_mbons),
        "avoidMbons": len(avoid_mbons),
        "synapsesToApproach": sum(c["approach"] for c in all_cells),
        "synapsesToAvoid": sum(c["avoid"] for c in all_cells),
    }
    data = {
        "dataset": "male-cns:v1.0",
        "minSynapses": MIN_SYNAPSES,
        "features": FEATURES,
        "stats": stats,
        "inputs": inputs,
        "sides": sides,
    }
    OUT.write_text(
        "// Generated by scripts/extract_wiring.py. Do not edit by hand.\n"
        "// This fly's real mushroom body wiring, from the Male CNS connectome v1.0 (CC-BY 4.0).\n"
        "(function (F) {\n"
        f"  F.WIRING = {json.dumps(data, separators=(',', ':'))};\n"
        "})(globalThis.FLYDO = globalThis.FLYDO || {});\n"
    )
    print(f"Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB)")
    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
