"""Simplified Eiffel Tower solid, exported as STEP.

Scale 1:1000 in millimetres, so 1 mm in the model = 1 m on the real tower.
Approximate real proportions: 125 m base square, first floor ~57 m,
second floor ~116 m, third floor ~276 m, overall height 330 m.
The iron lattice is not modelled; legs, arches, floors and spire are solid.
"""

import json
import math

from OCP.BRepAlgoAPI import BRepAlgoAPI_Common, BRepAlgoAPI_Cut, BRepAlgoAPI_Fuse
from OCP.BRepBndLib import BRepBndLib
from OCP.BRepBuilderAPI import (
    BRepBuilderAPI_MakeEdge,
    BRepBuilderAPI_MakeFace,
    BRepBuilderAPI_MakePolygon,
    BRepBuilderAPI_MakeWire,
    BRepBuilderAPI_Transform,
)
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.BRepGProp import BRepGProp
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.BRepOffsetAPI import BRepOffsetAPI_ThruSections
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder, BRepPrimAPI_MakePrism
from OCP.Bnd import Bnd_Box
from OCP.GProp import GProp_GProps
from OCP.IFSelect import IFSelect_RetDone
from OCP.STEPControl import STEPControl_AsIs, STEPControl_Writer
from OCP.StlAPI import StlAPI_Writer
from OCP.gp import gp_Ax1, gp_Ax2, gp_Dir, gp_Elips, gp_Pnt, gp_Trsf, gp_Vec

# ---------------------------------------------------------------- parameters
# Heights in model mm (= real metres at 1:1000)
FIRST_FLOOR_Z = 57.6
SECOND_FLOOR_Z = 115.7
THIRD_FLOOR_Z = 276.0
TOTAL_HEIGHT = 330.0

# Outer half-width of the tower silhouette vs. height (z, half_width)
OUTER_HALF_WIDTH = [
    (0.0, 62.5),
    (30.0, 47.0),
    (FIRST_FLOOR_Z, 36.0),
    (85.0, 27.5),
    (SECOND_FLOOR_Z, 20.5),
    (150.0, 15.0),
    (190.0, 11.0),
    (230.0, 8.0),
    (THIRD_FLOOR_Z, 5.5),
]

# Square leg section size vs. height; legs merge where size reaches half-width
LEG_SIZE = {
    0.0: 26.0,
    30.0: 22.0,
    FIRST_FLOOR_Z: 18.0,
    85.0: 15.0,
    SECOND_FLOOR_Z: 12.0,
    150.0: 11.0,
}
MERGE_OVERLAP = 1.05  # merged legs overlap slightly across the centre line

ARCH_PLATE_THICKNESS = 2.0
ARCH_PLATE_OFFSET = 33.0  # distance of arch plate from tower axis
ARCH_HALF_SPAN = 37.0
ARCH_RISE = 42.0


def half_width_at(z):
    for (z0, w0), (z1, w1) in zip(OUTER_HALF_WIDTH, OUTER_HALF_WIDTH[1:]):
        if z0 <= z <= z1:
            return w0 + (w1 - w0) * (z - z0) / (z1 - z0)
    raise ValueError(z)


def square_wire(x0, y0, x1, y1, z):
    polygon = BRepBuilderAPI_MakePolygon()
    for x, y in [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]:
        polygon.Add(gp_Pnt(x, y, z))
    polygon.Close()
    return polygon.Wire()


def loft(wires):
    builder = BRepOffsetAPI_ThruSections(True, False)
    for wire in wires:
        builder.AddWire(wire)
    builder.Build()
    return builder.Shape()


def rotated_about_z(shape, degrees):
    transform = gp_Trsf()
    transform.SetRotation(gp_Ax1(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1)), math.radians(degrees))
    return BRepBuilderAPI_Transform(shape, transform, True).Shape()


def box(x0, y0, z0, x1, y1, z1):
    return BRepPrimAPI_MakeBox(gp_Pnt(x0, y0, z0), gp_Pnt(x1, y1, z1)).Shape()


def centred_square_slab(half_size, z_bottom, z_top):
    return box(-half_size, -half_size, z_bottom, half_size, half_size, z_top)


def fuse_all(shapes):
    result = shapes[0]
    for shape in shapes[1:]:
        result = BRepAlgoAPI_Fuse(result, shape).Shape()
    return result


# ---------------------------------------------------------------- legs
def build_leg():
    wires = []
    for z, _ in OUTER_HALF_WIDTH:
        outer = half_width_at(z)
        size = LEG_SIZE.get(z, outer * MERGE_OVERLAP)
        size = min(size, outer * MERGE_OVERLAP)
        inner = outer - size
        wires.append(square_wire(inner, inner, outer, outer, z))
    return loft(wires)


leg = build_leg()
legs = [rotated_about_z(leg, angle) for angle in (0, 90, 180, 270)]

# Outer envelope, used to trim the arch plates to the leaning silhouette
envelope = loft(
    [square_wire(-w, -w, w, w, z) for z, w in OUTER_HALF_WIDTH if z <= SECOND_FLOOR_Z]
)


# ---------------------------------------------------------------- arches
def build_arch_plate():
    y0 = ARCH_PLATE_OFFSET - ARCH_PLATE_THICKNESS / 2
    plate = box(-70, y0, 0, 70, y0 + ARCH_PLATE_THICKNESS, FIRST_FLOOR_Z)

    # Elliptical opening, major axis vertical (rise > half span)
    ellipse = gp_Elips(
        gp_Ax2(gp_Pnt(0, y0 - 1, 0), gp_Dir(0, 1, 0), gp_Dir(0, 0, 1)),
        ARCH_RISE,
        ARCH_HALF_SPAN,
    )
    edge = BRepBuilderAPI_MakeEdge(ellipse).Edge()
    face = BRepBuilderAPI_MakeFace(BRepBuilderAPI_MakeWire(edge).Wire()).Face()
    opening = BRepPrimAPI_MakePrism(face, gp_Vec(0, ARCH_PLATE_THICKNESS + 2, 0)).Shape()

    plate = BRepAlgoAPI_Cut(plate, opening).Shape()
    return BRepAlgoAPI_Common(plate, envelope).Shape()


arch = build_arch_plate()
arches = [rotated_about_z(arch, angle) for angle in (0, 90, 180, 270)]

# ---------------------------------------------------------------- floors
first_floor = BRepAlgoAPI_Cut(
    centred_square_slab(39.0, FIRST_FLOOR_Z - 5.0, FIRST_FLOOR_Z + 2.0),
    centred_square_slab(16.0, FIRST_FLOOR_Z - 6.0, FIRST_FLOOR_Z + 3.0),
).Shape()

second_floor = BRepAlgoAPI_Cut(
    centred_square_slab(23.0, SECOND_FLOOR_Z - 3.0, SECOND_FLOOR_Z + 1.5),
    centred_square_slab(7.0, SECOND_FLOOR_Z - 4.0, SECOND_FLOOR_Z + 2.5),
).Shape()

third_floor = centred_square_slab(8.0, THIRD_FLOOR_Z - 3.0, THIRD_FLOOR_Z + 3.0)
lantern = centred_square_slab(5.0, THIRD_FLOOR_Z + 3.0, 290.0)

# ---------------------------------------------------------------- spire
spire_base = BRepPrimAPI_MakeCylinder(
    gp_Ax2(gp_Pnt(0, 0, 290.0), gp_Dir(0, 0, 1)), 2.0, 10.0
).Shape()
antenna = BRepPrimAPI_MakeCylinder(
    gp_Ax2(gp_Pnt(0, 0, 300.0), gp_Dir(0, 0, 1)), 0.7, TOTAL_HEIGHT - 300.0
).Shape()

# ---------------------------------------------------------------- assemble
tower = fuse_all(
    legs + arches + [first_floor, second_floor, third_floor, lantern, spire_base, antenna]
)

# ---------------------------------------------------------------- checks
properties = GProp_GProps()
BRepGProp.VolumeProperties_s(tower, properties)
bounds = Bnd_Box()
BRepBndLib.Add_s(tower, bounds)
corner_min = bounds.CornerMin()
corner_max = bounds.CornerMax()
xmin, ymin, zmin = corner_min.X(), corner_min.Y(), corner_min.Z()
xmax, ymax, zmax = corner_max.X(), corner_max.Y(), corner_max.Z()

step_writer = STEPControl_Writer()
step_writer.Transfer(tower, STEPControl_AsIs)
step_status = step_writer.Write("eiffel_tower.step")

BRepMesh_IncrementalMesh(tower, 0.3, False, 0.3, True)
StlAPI_Writer().Write(tower, "eiffel_tower_preview.stl")

print(
    json.dumps(
        {
            "valid": BRepCheck_Analyzer(tower).IsValid(),
            "volume_mm3": round(properties.Mass(), 1),
            "bbox_mm": [round(v, 2) for v in (xmin, ymin, zmin, xmax, ymax, zmax)],
            "step_written": step_status == IFSelect_RetDone,
        }
    )
)
