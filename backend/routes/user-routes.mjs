import express from "express";
import User from "../mongoose/user.mjs";
import bcrypt, { compare } from "bcrypt";
import Token from "../mongoose/email-token.mjs";
import { sendEmail } from "../utils/sendEmail.js";
import Joi from "joi";
import passwordComplexity from "joi-password-complexity";
import jwt from "jsonwebtoken";
import { hashPassword, comparePassword } from "../encryptpass.mjs";
import nodemailer from "nodemailer";
const router = express.Router();

const register = async (req, res) => {
  try {
    //input validation function
    const validate = (data) => {
      const schema = Joi.object({
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
      { expiresIn: "1h" }
    );
    res
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
    if (!token) return res.status(400).send({ message: "invalid Link" });
    await User.updateOne({ _id: user._id }, { verified: true });
    await token.remove();

    res.status(200).send({ message: "Email Verified successfully" });
  } catch (error) {
    res.status(500).send({ message: "Internally Server Error" });
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
    const url = `http://localhost:3000/${user.id}/${token.token}`; //!!!!!!! need to change this url later.
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
    await token.remove();
    res.status(200).send({ message: "Password has been successfully reset" });
  } catch (error) {
    res.status(500).send({ message: "Internal server error" });
  }
};

const sendEmail = async (email, subject, message) => {
  try {
    const transporter = nodemailer.createTransport({
      //creates a transporter object that is used to send emails.
      service: "gmail",
      auth: {
        //contains the credentials needed to log in to the email account:
        user: process.env.HOST, //email address of the sender
        pass: process.env.PASS, //password of the sender's email account
      },
    });

    transporter.sendMail({
      //used to actually send the mail.
      from: process.env.HOST, //email address of the sender
      to: email, //email address of the receiver
      subject: subject, //subject of the email
      html: message, //html content of the email
    });
    console.log("Email sent Successfully");
  } catch (error) {
    console.log("Email not sent");
    console.log(error);
    return error;
  }
};

router.post("/api/login", login);

router.post("/api/register", register);

router.get("/:id/verify/:token", emailLink);

router.post("/passwordreset", passwordLink);

router.get("/:id/:token", verifyUrl);

router.post("/:id/:token", resetPassword);
