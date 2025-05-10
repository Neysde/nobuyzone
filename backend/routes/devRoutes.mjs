import express from "express";
import Admin from "../mongoose/admin.mjs"; // Admin model
import { hashPassword } from "../encryptpass.mjs"; // Password hashing utility

const router = express.Router();

// POST /dev/add-admin - Temporary endpoint to add a new admin user
router.post("/add-admin", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Username and password are required." });
  }

  try {
    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ username });
    if (existingAdmin) {
      return res
        .status(409)
        .json({ message: "Admin with this username already exists." });
    }

    // Hash the password
    const hashedPassword = await hashPassword(password);

    // Create and save the new admin
    const newAdmin = new Admin({
      username,
      password: hashedPassword,
    });
    await newAdmin.save();

    res.status(201).json({
      message: "Admin user created successfully.",
      admin: { id: newAdmin._id, username: newAdmin.username },
    });
  } catch (error) {
    console.error("Error creating admin user:", error);
    res
      .status(500)
      .json({ message: "Server error while creating admin user." });
  }
});

export default router;
