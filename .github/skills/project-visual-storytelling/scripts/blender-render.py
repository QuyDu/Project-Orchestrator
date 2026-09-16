import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args():
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--plan-sha256", required=True)
    return parser.parse_args(values)


def rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[index : index + 2], 16) / 255 for index in (0, 2, 4)) + (1.0,)


def material(name, color, roughness=0.62, texture_scale=7.0, bump_strength=0.12):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    nodes = result.node_tree.nodes
    links = result.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    noise = nodes.new("ShaderNodeTexNoise")
    bump = nodes.new("ShaderNodeBump")
    shader.inputs["Base Color"].default_value = rgb(color)
    shader.inputs["Roughness"].default_value = roughness
    noise.inputs["Scale"].default_value = texture_scale
    noise.inputs["Detail"].default_value = 3.0
    noise.inputs["Roughness"].default_value = 0.7
    bump.inputs["Strength"].default_value = bump_strength
    bump.inputs["Distance"].default_value = 0.08
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    return result


def apply_material(obj, value):
    obj.data.materials.append(value)


def add_cube(name, location, dimensions, value, bevel=0.08):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = obj.modifiers.new("Soft handmade edges", "BEVEL")
    modifier.width = min(bevel, min(dimensions) / 4)
    modifier.segments = 3
    apply_material(obj, value)
    return obj


def add_cylinder(name, location, dimensions, value):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.5, depth=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_material(obj, value)
    return obj


def add_sphere(name, location, dimensions, value):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_material(obj, value)
    return obj


def add_text(name, body, location, size, value, horizontal=False):
    bpy.ops.object.text_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.body = body
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.extrude = 0.012
    obj.data.bevel_depth = 0.003
    obj.data.size = min(size, max(0.12, 5.5 / max(len(body), 1)))
    obj.rotation_euler = (0, 0, 0) if horizontal else (math.radians(90), 0, 0)
    apply_material(obj, value)
    return obj


def look_at(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_light(name, kind, location, energy, color, size):
    data = bpy.data.lights.new(name=name, type=kind)
    data.energy = energy
    data.color = color
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    look_at(obj, (0, 0, 1.5))
    return obj


def create_element(element, materials, visual_type):
    x, y, z = element["position"]
    width, depth, height = element["size"]
    value = materials[element["semanticRole"]]
    shape = element["shape"]
    if visual_type == "whiteboard":
        y = -0.35
        z = max(-1.8, min(3.8, z))
        card_material = materials["paper"] if element["semanticRole"] == "neutral" else value
        add_cube(element["id"], (x, y, z), (width, 0.10, height), card_material, 0.04)
        label_size = min(0.34, height * 0.30, width / (max(len(element["label"]), 1) * 0.62))
        add_text(f"{element['id']}-label", element["label"], (x, y - 0.065, z), label_size, materials["ink"])
        return
    if shape in ("box", "panel", "path"):
        add_cube(element["id"], (x, y, z + height / 2), (width, depth, height), value)
    elif shape == "cylinder":
        add_cylinder(element["id"], (x, y, z + height / 2), (width, depth, height), value)
    elif shape == "sphere":
        add_sphere(element["id"], (x, y, z + height / 2), (width, depth, height), value)
    elif shape == "figure":
        add_cylinder(f"{element['id']}-body", (x, y, z + height * 0.42), (width * 0.48, depth * 0.48, height * 0.62), value)
        add_sphere(f"{element['id']}-head", (x, y, z + height * 0.82), (width * 0.42, depth * 0.42, height * 0.28), materials["clay"])
    plaque_z = z + height + 0.32
    add_cube(f"{element['id']}-plaque", (x, y - depth / 2 - 0.08, plaque_z), (max(width, 1.25), 0.10, 0.42), materials["paper"], 0.03)
    add_text(f"{element['id']}-label", element["label"], (x, y - depth / 2 - 0.14, plaque_z), 0.26, materials["ink"])


def build_scene(plan):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.materials, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
        for item in list(collection):
            collection.remove(item)

    palette = plan["palette"]
    materials = {
        "focus": material("Focus painted card", palette["focus"], 0.72, 9.0, 0.16),
        "positive": material("Positive painted card", palette["positive"], 0.70, 8.0, 0.14),
        "risk": material("Risk painted card", palette["risk"], 0.68, 8.0, 0.14),
        "neutral": material("Neutral model material", palette["neutral"], 0.74, 10.0, 0.18),
        "paper": material("Warm paper", "#E8DCC8", 0.82, 14.0, 0.20),
        "wood": material("Model wood", "#8A5D3B", 0.76, 5.0, 0.16),
        "clay": material("Miniature clay", "#C98D72", 0.80, 11.0, 0.13),
        "ink": material("Charcoal ink", "#171717", 0.48, 20.0, 0.03),
        "board": material("Whiteboard surface", "#ECEDE8", 0.34, 18.0, 0.05),
    }

    if plan["visualType"] == "whiteboard":
        add_cube("Whiteboard", (0, 0, 1.0), (12.4, 0.32, 7.2), materials["board"], 0.06)
        add_cube("Frame top", (0, -0.04, 4.67), (13.0, 0.46, 0.24), materials["wood"], 0.04)
        add_cube("Frame bottom", (0, -0.04, -2.67), (13.0, 0.46, 0.24), materials["wood"], 0.04)
        add_cube("Frame left", (-6.38, -0.04, 1.0), (0.24, 0.46, 7.2), materials["wood"], 0.04)
        add_cube("Frame right", (6.38, -0.04, 1.0), (0.24, 0.46, 7.2), materials["wood"], 0.04)
        add_text("Title", plan["title"], (0, -0.36, 4.05), 0.62, materials["ink"])
        for element in plan["elements"]:
            create_element(element, materials, "whiteboard")
        add_text("Signature", plan["signature"], (-3.7, -0.36, -2.23), 0.25, materials["ink"])
        add_text("Creation date", plan["creationDate"], (4.7, -0.36, -2.23), 0.25, materials["ink"])
        camera_location = (0, -16.5, 1.2)
        camera_target = (0, 0, 1.0)
        lens = 54
    else:
        add_cube("Bounded model base", (0, 0, -0.35), (13.0, 9.0, 0.7), materials["wood"], 0.16)
        add_cube("Exhibit backdrop", (0, 4.35, 3.0), (13.0, 0.35, 6.7), materials["paper"], 0.08)
        add_text("Title", plan["title"], (0, 4.14, 4.8), 0.64, materials["ink"])
        for element in plan["elements"]:
            create_element(element, materials, "diorama")
        add_cube("Attribution plaque", (0, -4.02, 0.15), (9.5, 0.18, 0.75), materials["paper"], 0.05)
        add_text("Signature", plan["signature"], (-2.0, -4.14, 0.20), 0.25, materials["ink"])
        add_text("Creation date", plan["creationDate"], (3.6, -4.14, 0.20), 0.25, materials["ink"])
        camera_location = (11.8, -15.8, 11.0)
        camera_target = (0, 0.5, 1.7)
        lens = 52

    camera_data = bpy.data.cameras.new("Perspective product camera")
    camera = bpy.data.objects.new("Perspective product camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = camera_location
    camera.data.lens = lens
    camera.data.type = "PERSP"
    look_at(camera, camera_target)
    bpy.context.scene.camera = camera

    add_light("Warm key", "AREA", (-6, -8, 11), 1350, (1.0, 0.72, 0.52), 5.0)
    add_light("Soft fill", "AREA", (7, -2, 8), 850, (0.62, 0.78, 1.0), 4.0)
    add_light("Backdrop rim", "AREA", (0, 5, 9), 1050, (1.0, 0.88, 0.68), 3.5)

    world = bpy.data.worlds.new("Warm studio world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.025, 0.022, 0.018, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.24
    bpy.context.scene.world = world


def configure_render(plan, output):
    scene = bpy.context.scene
    try:
        scene.render.engine = "CYCLES"
        scene.cycles.device = "CPU"
        scene.cycles.samples = plan["canvas"]["samples"]
        scene.cycles.use_denoising = True
    except Exception:
        raise RuntimeError("Cycles is unavailable; a physically based production render cannot be qualified")
    scene.render.resolution_x = plan["canvas"]["width"]
    scene.render.resolution_y = plan["canvas"]["height"]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.filepath = str(output)
    scene.view_settings.look = "AgX - Medium High Contrast"


def pixel_variation(output_path):
    image = bpy.data.images.load(str(output_path), check_existing=False)
    try:
        if len(image.pixels) == 0:
            return 0.0
        step = max(4, (len(image.pixels) // 12000 // 4) * 4)
        samples = [image.pixels[index] for index in range(0, len(image.pixels), step)]
        return round(max(samples) - min(samples), 6) if samples else 0.0
    finally:
        bpy.data.images.remove(image)


def main():
    args = parse_args()
    plan_path = Path(args.plan).resolve()
    output_path = Path(args.output).resolve()
    report_path = Path(args.report).resolve()
    plan_bytes = plan_path.read_bytes()
    if hashlib.sha256(plan_bytes).hexdigest() != args.plan_sha256:
        raise RuntimeError("Render plan digest changed before Blender execution")
    plan_source = plan_bytes.decode("utf-8")
    plan = json.loads(plan_source)
    build_scene(plan)
    configure_render(plan, output_path)
    bpy.ops.render.render(write_still=True)
    report = {
        "schemaVersion": "1.0.0",
        "status": "rendered",
        "rendererClass": "physically-based-3d",
        "tool": bpy.app.version_string,
        "engine": "CYCLES",
        "geometryCount": sum(1 for obj in bpy.context.scene.objects if obj.type == "MESH"),
        "materialCount": len(bpy.data.materials),
        "lightCount": sum(1 for obj in bpy.context.scene.objects if obj.type == "LIGHT"),
        "cameraType": bpy.context.scene.camera.data.type,
        "castShadows": True,
        "contactShadows": True,
        "pixelVariation": pixel_variation(output_path),
        "renderPlanSha256": args.plan_sha256,
        "renderedText": [plan["title"], *[item["label"] for item in plan["elements"]], plan["signature"], plan["creationDate"]],
        "manualVisualInspectionRequired": True,
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()