import express from "express";
import User from "../mongoose/user.mjs";
import Token from "../mongoose/email-token.mjs";
import Joi from "joi";
import passwordComplexity from "joi-password-complexity";
import jwt from "jsonwebtoken";
import { hashPassword, comparePassword } from "../encryptpass.mjs";
import nodemailer from "nodemailer";
import Post from "../mongoose/post.mjs";
import { isAuthenticated } from "../middlewares.mjs";
import fetch from "node-fetch";

const router = express.Router();

const register = async (req, res) => {
  try {
    //input validation function
    const validate = (data) => {
      const schema = Joi.object({
        username: Joi.string().required().label("Username"),
        firstName: Joi.string().required().label("First Name"),
        lastName: Joi.string().required().label("Last Name"),
        email: Joi.string().email().required().label("Email"),
        password: passwordComplexity().required().label("password"), //these funcs. come from joi
      });
      return schema.validate(data);
    };

    //validates req.body
    const { error } = validate(req.body);
    if (error)
      return res.status(400).send({ message: error.details[0].message });

    let user = await User.findOne({ email: req.body.email });
    if (user)
      return res
        .status(409)
        .send({ message: "User with given email already exist" });

    const hashedPassword = await hashPassword(req.body.password);
    user = await new User({ ...req.body, password: hashedPassword }).save();
    const token = await new Token({
      userId: user._id,
      token: jwt.sign(
        { email: user.email, _id: user._id },
        "process.env.SECRETKEY",
        { expiresIn: "1h" }
      ), //key will be moved to .env file. (process.env.SECRETKEY)
    }).save();

    const url = `http://localhost:3000/${user.id}/verify/${token.token}`; //!!!!!!! need to change url later.

    //Maybe need to change this html design used in email template later.
    const subject = " Please Verify Email";
    const message = `
      <h3>Hello ${user.firstName} ${user.lastName}</h3>
      <p>Thanks yor for registering for our services.</p>
      <p>Click this link <a href="${url}">here</a> to verify your email</p>
    `;
    await sendEmail(user.email, subject, message); //imports sendEmail func.
    res.status(201).send({ message: "An Email sent to your account please" });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Internally Server Error" });
  }
};

const login = async (req, res) => {
  try {
    const validate = (data) => {
      const schema = Joi.object({
        email: Joi.string().email().required().label("Email"),
        password: Joi.string().required().label("password"),
      });
      return schema.validate(data);
    };

    const { error } = validate(req.body);
    if (error)
      return res.status(400).send({ message: error.details[0].message });

    const user = await User.findOne({ email: req.body.email });

    if (!user)
      return res.status(401).send({ message: "Invalid Email or Password" });

    const validPassword = await comparePassword(
      req.body.password,
      user.password
    );

    if (!validPassword)
      return res.status(401).send({ message: "Invalid Email or Password" });

    if (!user.verified) {
      return res.status(403).send({ message: "Verify your Account." });
    }
    const token = jwt.sign(
      { email: user.email, _id: user._id },
      "process.env.SECRETKEY", //will be moved to .env file.
      { expiresIn: "1d" }
    );
    res
      .cookie("login", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 24 * 60 * 60 * 1000, //1 day
      })
      .status(200)
      .send({ data: token, message: "User has successfully logged in" });
  } catch (error) {
    res.status(500).send({ message: "Internally Server Error" });
  }
};

const emailLink = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id });
    if (!user) return res.status(400).send({ message: "Invalid Link" });

    const token = await Token.findOne({
      userId: user._id,
      token: req.params.token,
    });
    if (!token) return res.status(400).send({ message: "Invalid Link" });
    await User.updateOne({ _id: user._id }, { verified: true });
    await token.deleteOne();

    // Redirect to the success page instead of sending a JSON response
    res.redirect(`/${user._id}/verify/${req.params.token}/success`);
  } catch (error) {
    res.status(500).send({ message: "Internal Server Error" });
  }
};

const passwordLink = async (req, res) => {
  try {
    const validate = (data) => {
      const emailSchema = Joi.object({
        email: Joi.string().email().required().label("Email"),
      });
      return emailSchema.validate(data);
    };
    const { error } = validate(req.body);
    if (error)
      return res.status(400).send({
        message: error.details[0].message,
      });
    let user = await User.findOne({ email: req.body.email });
    if (!user)
      return res
        .status(409)
        .send({ message: "user with email does not exist" });

    let token = await Token.findOne({ userId: user._id });

    if (!token) {
      token = await new Token({
        userId: user._id,
        token: jwt.sign(
          { email: user.email, _id: user._id },
          "process.env.SECRETKEY",
          { expiresIn: "1h" }
        ), //secret will be moved to .env file.
      }).save();
    }
    const url = `http://localhost:3000/reset/${user.id}/${token.token}`; //Updated URL to match new route path
    const subject = "Password Reset";
    const message = `
        <p>Here is a link to reset your password</p>
        <p>Click thi link <a href="${url}">here</a> to reset your password</p>
      `;

    await sendEmail(user.email, subject, message);

    res.status(200).send({
      message: "Password reset link has been sent to your email account",
    });
  } catch (error) {
    res.status(500).send({ message: "Internal server error" });
  }
};

const verifyUrl = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id });
    if (!user) return res.status(400).send({ message: "Invalid link" });

    const token = await Token.findOne({
      userId: user._id,
      token: req.params.token,
    });
    if (!token) return res.status(400).send({ message: "Invalid Link" });
    res.status(200).send({ message: "Valid Url" });
  } catch (error) {
    res.status(500).send({ message: "Internal server error" });
  }
};

const resetPassword = async (req, res) => {
  try {
    const validate = (data) => {
      const passwordSchema = Joi.object({
        password: passwordComplexity().required().label("password"),
      });
      return passwordSchema.validate(data);
    };
    const { error } = validate(req.body);
    if (error)
      return res.status(400).send({
        message: error.details[0].message,
      });
    const user = await User.findOne({ _id: req.params.id });
    if (!user) return res.status(400).send({ message: "Invalid link" });

    const token = await Token.findOne({
      userId: user._id,
      token: req.params.token,
    });
    if (!token) return res.status(400).send({ message: "Invalid Link" });

    if (!user.verified) user.verified = true;

    const hashedPassword = await hashPassword(req.body.password);
    user.password = hashedPassword;
    await user.save();
    await token.deleteOne(); //use deleteOne instead of delete or remove(deprecated)
    res.status(200).send({ message: "Password has been successfully reset" });
  } catch (error) {
    res.status(500).send({ message: "Internal Server Error" });
  }
};

const sendEmail = async (email, subject, message) => {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587, //TLS port
      secureConnection: false, //TLS requires secureConnection to be false
      auth: {
        user: "zucklol1453@gmail.com", // Will be moved to process.env.EMAIL_USER
        pass: "rjpo kbif nxnu tapl", // Use app password will be moved to .env process.env.APP_PASSWORD
      },
      tls: {
        ciphers: "SSLv3",
      },
    });

    await transporter.sendMail({
      from: '"Barter App" <zucklol1453@gmail.com>', // Better formatted sender
      to: email,
      subject: subject,
      html: message,
    });
    console.log("Email sent Successfully");
  } catch (error) {
    console.log("Email not sent");
    console.log(error);
    return error;
  }
};

const logout = async (req, res) => {
  try {
    res
      .clearCookie("login")
      .status(200)
      .send({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Error during logout:", error);
    res.status(500).send({ message: "Internal server error during logout" });
  }
};

//login and register routes
router.post("/api/login", login);

router.post("/api/register", register);

router.post("/api/logout", isAuthenticated, logout);

router.get("/:id/verify/:token", emailLink); //register verification

//password reset routes
router.post("/api/passwordreset", passwordLink);

router.get("/reset/:id/:token", verifyUrl); //password reset verification

router.post("/reset/:id/:token", resetPassword);

// Update username
router.patch("/api/user/username", isAuthenticated, async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).send({ message: "Username is required" });
    }

    // Check if username is already taken
    const existingUser = await User.findOne({ username });
    if (
      existingUser &&
      existingUser._id.toString() !== req.user._id.toString()
    ) {
      return res.status(409).send({ message: "Username already taken" });
    }

    // Update the username
    await User.findByIdAndUpdate(req.user._id, { username });

    res.status(200).send({ message: "Username updated successfully" });
  } catch (error) {
    console.error("Error updating username:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

// Update profile picture
router.patch("/api/user/profile-picture", isAuthenticated, async (req, res) => {
  try {
    const { url, publicId } = req.body;

    // Validate required fields
    if (!url || !publicId) {
      return res.status(400).json({
        success: false,
        error: "Image URL and publicId are required",
      });
    }

    // Find the current user to get the old profile picture
    const user = await User.findById(req.user._id);

    // Delete the old profile picture from Cloudinary if it exists
    if (user && user.profilePicture && user.profilePicture.publicId) {
      try {
        // Use the existing delete endpoint via direct API call
        const deleteUrl = `${req.protocol}://${req.get("host")}/api/delete/${
          user.profilePicture.publicId
        }`;
        const deleteResponse = await fetch(deleteUrl, {
          method: "DELETE",
        });

        if (deleteResponse.ok) {
          console.log(
            `Deleted old profile picture: ${user.profilePicture.publicId}`
          );
        } else {
          console.error("Failed to delete old profile picture");
        }
      } catch (deleteError) {
        console.error("Error deleting old profile picture:", deleteError);
        // Continue with the update even if deletion fails
      }
    }

    // Update user profile with new picture information
    await User.findByIdAndUpdate(req.user._id, {
      profilePicture: {
        url,
        publicId,
      },
    });

    // Return success response
    return res.status(200).json({
      success: true,
      message: "Profile picture updated successfully",
    });
  } catch (error) {
    console.error("Error updating profile picture:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to update profile picture: " + error.message,
    });
  }
});

// Get current user ID for redirection
router.get("/api/user/current", isAuthenticated, async (req, res) => {
  try {
    // Since isAuthenticated middleware already adds user to req.user,
    // we can simply return the user ID from there
    res.status(200).json({
      success: true,
      userId: req.user._id,
    });
  } catch (error) {
    console.error("Error getting user ID:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get user ID",
    });
  }
});

export default router;
