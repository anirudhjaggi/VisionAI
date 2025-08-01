import { db } from "@/database/db";
import { NextRequest, NextResponse } from "next/server";
import { verify } from "jsonwebtoken";
import { z } from "zod";

interface DecodedToken {
  userId: string;
}

const cameraSchema = z.object({
  name: z.string().min(1, "Camera name is required"),
  streamUrl: z.string().url("Invalid URL format").optional().or(z.literal("")),
  locationId: z
    .number()
    .int()
    .positive("Location ID must be a positive integer"),
});

/**
 * @swagger
 * /api/configs/camera:
 *   post:
 *     summary: Add a new camera
 *     tags:
 *       - Configurations
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - locationId
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name of the camera
 *                 minLength: 1
 *               streamUrl:
 *                 type: string
 *                 format: url
 *                 description: URL of the camera stream (optional)
 *               locationId:
 *                 type: number
 *                 format: integer
 *                 description: ID of the location where the camera is installed
 *                 minimum: 1
 *     responses:
 *       201:
 *         description: Camera added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: number
 *                 name:
 *                   type: string
 *                 stream_url:
 *                   type: string
 *                 location_id:
 *                   type: number
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Location not found or does not belong to user
 *       500:
 *         description: Internal server error
 */
export async function POST(req: NextRequest) {
  const accessToken = req.cookies.get("accessToken")?.value;

  if (!accessToken) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const decoded = verify(
      accessToken,
      process.env.JWT_ACCESS_SECRET!,
    ) as DecodedToken;
    const userId = decoded.userId;

    const body = await req.json();
    const { name, streamUrl, locationId } = cameraSchema.parse(body);

    // Verify that the location belongs to a factory owned by the user
    const locationCheck = await db.query(
      "SELECT l.id FROM locations l JOIN factories f ON l.factory_id = f.id WHERE l.id = $1 AND f.user_id = $2",
      [locationId, userId],
    );

    if (locationCheck.rows.length === 0) {
      return NextResponse.json(
        { message: "Location not found or does not belong to user" },
        { status: 404 },
      );
    }

    const { rows } = await db.query(
      "INSERT INTO cameras (name, stream_url, location_id) VALUES ($1, $2, $3) RETURNING *",
      [name, streamUrl || null, locationId],
    );

    return NextResponse.json(rows[0], { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: error.issues[0].message },
        { status: 400 },
      );
    }
    console.error("Error adding camera:", error);
    return NextResponse.json(
      { message: "Error adding camera" },
      { status: 500 },
    );
  }
}
