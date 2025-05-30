import express from "express";
import mongoose from "mongoose";
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
        termsAccepted: Joi.boolean().valid(true).required().messages({
          "any.only": "Kullanım Koşullarını ve Gizlilik Politikasını kabul etmelisiniz",
          "any.required": "Koşulların kabulü gereklidir",
        }),
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
        .send({ message: "Bu e-posta adresi ile kayıtlı bir kullanıcı zaten var" });

    const hashedPassword = await hashPassword(req.body.password);
    user = await new User({
      ...req.body,
      password: hashedPassword,
      termsAccepted: req.body.termsAccepted,
    }).save();
    const token = await new Token({
      userId: user._id,
      token: jwt.sign(
        { email: user.email, _id: user._id },
        process.env.SECRETKEY,
        { expiresIn: "1h" }
      ),
    }).save();

    const url = `${process.env.BASE_URL}/${user.id}/verify/${token.token}`;

    //Maybe need to change this html design used in email template later.
    const subject = "Lütfen E-posta Adresinizi Doğrulayın";
    const message = `
      <h3>Merhaba ${user.firstName} ${user.lastName}</h3>
      <p>Sitemize kayıt olduğunuz için teşekkür ederiz.</p>
      <p>E-posta adresinizi doğrulamak için <a href="${url}">buraya</a> tıklayın</p>
    `;
    await sendEmail(user.email, subject, message); //imports sendEmail func.
    res.status(201).send({ message: "Hesabınıza bir e-posta gönderildi" });
  } catch (error) {
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
      return res.status(403).send({ message: "Hesabınızı doğrulayın." });
    }
    const token = jwt.sign(
      { email: user.email, _id: user._id },
      process.env.SECRETKEY,
      { expiresIn: "1d" }
    );
    res
      .cookie("login", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV,
        maxAge: parseInt(process.env.COOKIE_MAX_AGE),
      })
      .status(200)
      .send({ data: token, message: "Kullanıcı başarıyla giriş yaptı" });
  } catch (error) {
    res.status(500).send({ message: "Internally Server Error" });
  }
};

const emailLink = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id });
    if (!user) return res.status(400).send({ message: "Geçersiz Bağlantı" });

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
        .send({ message: "Bu e-posta adresi ile kayıtlı kullanıcı bulunamadı" });

    let token = await Token.findOne({ userId: user._id });

    if (!token) {
      token = await new Token({
        userId: user._id,
        token: jwt.sign(
          { email: user.email, _id: user._id },
          process.env.SECRETKEY,
          { expiresIn: "1h" }
        ),
      }).save();
    }
    const url = `${process.env.BASE_URL}/reset/${user.id}/${token.token}`;
    const subject = "Şifre Sıfırlama";
    const message = `
        <p>Şifrenizi sıfırlamak için bir bağlantı</p>
        <p>Şifrenizi sıfırlamak için <a href="${url}">buraya</a> tıklayın</p>
      `;

    await sendEmail(user.email, subject, message);

    res.status(200).send({
      message: "Şifre sıfırlama bağlantısı e-posta adresinize gönderildi",
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
    res.status(200).send({ message: "Geçerli Bağlantı" });
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
    res.status(200).send({ message: "Şifreniz başarıyla sıfırlandı" });
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
        user: process.env.EMAIL_USER,
        pass: process.env.APP_PASSWORD,
      },
      tls: {
        ciphers: "SSLv3",
      },
    });

    await transporter.sendMail({
      from:
        process.env.EMAIL_FROM || `"NoBuyZone" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: subject,
      html: message,
    });
  } catch (error) {
    return error;
  }
};

const logout = async (req, res) => {
  try {
    res
      .clearCookie("login")
      .status(200)
      .send({ message: "Başarıyla çıkış yapıldı" });
  } catch (error) {
    console.error("Error during logout:", error);
    res.status(500).send({ message: "Çıkış yaparken sunucu hatası oluştu" });
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
      return res.status(400).send({ message: "Kullanıcı adı gereklidir" });
    }

    // Check if username is already taken
    const existingUser = await User.findOne({ username });
    if (
      existingUser &&
      existingUser._id.toString() !== req.user._id.toString()
    ) {
      return res.status(409).send({ message: "Bu kullanıcı adı zaten alınmış" });
    }

    // Update the username
    await User.findByIdAndUpdate(req.user._id, { username });

    res.status(200).send({ message: "Kullanıcı adı başarıyla güncellendi" });
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
        error: "Resim URL'si ve publicId gereklidir",
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

       if (!deleteResponse.ok) {
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
      message: "Profil resmi başarıyla güncellendi",
    });
  } catch (error) {
    console.error("Error updating profile picture:", error);
    return res.status(500).json({
      success: false,
      error: "Profil resmi güncellenemedi: " + error.message,
    });
  }
});

// Update privacy settings (showUsername)
router.patch("/api/user/privacy", isAuthenticated, async (req, res) => {
  try {
    const { showUsername } = req.body;

    // Check if showUsername is a boolean value
    if (typeof showUsername !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "showUsername bir boolean değeri olmalıdır",
      });
    }

    // Update the user's privacy setting
    await User.findByIdAndUpdate(req.user._id, { showUsername });

    // Return success response
    return res.status(200).json({
      success: true,
      message: "Privacy settings updated successfully",
    });
  } catch (error) {
    console.error("Error updating privacy settings:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update privacy settings: " + error.message,
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

// Check authentication status
router.get("/api/check-auth", (req, res) => {
  if (req.user) {
    return res.status(200).json({
      authenticated: true,
      user: {
        _id: req.user._id,
        name: `${req.user.firstName} ${req.user.lastName}`,
        email: req.user.email,
        profilePicture: req.user.profilePicture.url,
      },
    });
  } else {
    return res.status(401).json({
      authenticated: false,
      message: "Not authenticated",
    });
  }
});

// Delete account route
router.delete("/api/user/delete-account", isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;
    const protocol = req.protocol; // 'http' or 'https'
    const host = req.get("host");
    const cookies = req.headers.cookie || "";

    // 1. Delete all posts and drafts created by the user using the API routes
    // First, get all user's posts
    const posts = await Post.find({
      createdBy: userId,
      status: "active"
    }).select("_id");

    // Get all user's drafts
    const drafts = await Post.find({
      createdBy: userId,
      status: "draft"
    }).select("_id");

    // Delete each post using the post delete API to ensure Cloudinary images are deleted
    for (const post of posts) {
      try {
        const deleteUrl = `${protocol}://${host}/api/posts/${post._id}`;
        await fetch(deleteUrl, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookies
          },
          credentials: "same-origin"
        });
      } catch (postError) {
        console.error(`Error deleting post ${post._id}:`, postError);
        // Continue with other deletions even if one fails
      }
    }

    // Delete each draft using the draft delete API
    for (const draft of drafts) {
      try {
        const deleteUrl = `${protocol}://${host}/api/drafts/${draft._id}`;
        await fetch(deleteUrl, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookies
          },
          credentials: "same-origin"
        });
      } catch (draftError) {
        console.error(`Error deleting draft ${draft._id}:`, draftError);
        // Continue with other deletions even if one fails
      }
    }

    // 2. Find all messages where this user is a participant
    const Message = mongoose.model('Message');
    await Message.deleteMany({
      "users.user": userId
    });

    // 3. Remove user from other users' favorites
    await User.updateMany(
      { favorites: { $in: [userId] } },
      { $pull: { favorites: userId } }
    );

    // 4. Finally, delete the user account
    await User.findByIdAndDelete(userId);

    // 5. Clear the login cookie
    res.clearCookie("login");

    return res.status(200).json({
      success: true,
      message: "Hesabınız ve ilgili tüm verileriniz başarıyla silindi"
    });
  } catch (error) {
    console.error("Error deleting account:", error);
    return res.status(500).json({
      success: false,
      message: "Hesap silinirken bir hata oluştu: " + error.message
    });
  }
});

export default router;
