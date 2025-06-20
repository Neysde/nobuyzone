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
          "any.only":
            "Kullanım Koşullarını ve Gizlilik Politikasını kabul etmelisiniz",
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
      return res.status(409).send({
        message: "Bu e-posta adresi ile kayıtlı bir kullanıcı zaten var",
      });

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
      <!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>E-posta Doğrulama</title>
<style>
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    margin: 0;
    padding: 0;
    background-color: #f7f7f7; /* --neutral-200 */
    color: #404040; /* --neutral-700 */
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  .email-container {
    max-width: 600px;
    margin: 40px auto;
    background-color: #ffffff; /* --neutral-100 */
    border: 1px solid #e5e5e5; /* --neutral-300 */
    border-radius: 0.5rem; /* --radius-lg, for example */
    overflow: hidden;
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); /* --shadow-sm */
  }
  .email-body {
    padding: 30px 35px; /* Consider mapping to spacing variables */
    line-height: 1.6;
    text-align: left;
  }
  .email-body h2 {
    font-size: 20px; /* Consider --font-size-lg or similar */
    color: #404040; /* --neutral-700 */
    margin-top: 0;
    margin-bottom: 20px; /* --space-md or --space-lg */
  }
  .email-body p {
    margin-bottom: 15px; /* --space-md */
    font-size: 1rem; /* --font-size-md */
  }
  .email-button-container {
    text-align: center;
    margin: 30px 0; /* --space-lg or --space-xl */
  }
  .email-button {
    background-color: #60a5fa; /* --primary */
    color: #ffffff !important; /* --neutral-100, !important for link override */
    padding: 15px 30px; /* Consider mapping to spacing variables */
    text-decoration: none;
    border-radius: 0.375rem; /* --radius-md */
    font-size: 1rem; /* --font-size-md */
    font-weight: bold;
    display: inline-block;
    border: none;
    cursor: pointer;
    transition: background-color 0.3s ease;
  }
  .email-button:hover {
    background-color: #3b82f6; /* --primary-dark */
  }
  .email-footer {
    text-align: center;
    padding: 20px; /* --space-md or --space-lg */
    font-size: 0.875rem; /* --font-size-sm */
    color: #737373; /* --neutral-600 */
    border-top: 1px solid #e5e5e5; /* --neutral-300 */
  }
  .email-footer p {
    margin: 0;
  }

  /* Mobil uyumluluk için bazı eklemeler */
  @media screen and (max-width: 600px) {
    .email-container {
      width: 100% !important;
      margin: 10px 0;
      border-radius: 0; /* No radius on full width */
      border-left: none;
      border-right: none;
      box-shadow: none; /* Optional: remove shadow on mobile if it causes issues */
    }
    .email-body {
      padding: 20px 25px;
    }
    .email-header {
      padding: 25px;
    }
    .email-button {
      padding: 12px 25px;
      font-size: 0.875rem; /* --font-size-sm or 15px */
    }
  }
</style>
</head>
<body>
  <div class="email-container">
    <div class="email-body">
      <h2>Merhaba ${user.firstName} ${user.lastName},</h2>
      <p>Sitemize gerçekleştirdiğiniz kayıt işlemi için teşekkür ederiz.</p>
      <p>Hesabınızı aktif hale getirmek ve e-posta adresinizi doğrulamak için lütfen aşağıdaki butona tıklayın:</p>
      <div class="email-button-container">
        <a href="${url}" class="email-button" target="_blank">E-postayı Doğrula</a>
      </div>
      <p>Eğer yukarıdaki buton çalışmıyorsa, aşağıdaki bağlantıyı kopyalayıp tarayıcınızın adres çubuğuna yapıştırabilirsiniz:</p>
      <p><a href="${url}" target="_blank" style="color: #60a5fa; text-decoration: underline;">${url}</a></p> <p>Bu isteği siz yapmadıysanız, lütfen bu e-postayı dikkate almayınız.</p>
    </div>
    <div class="email-footer">
      <p>&copy; ${new Date().getFullYear()} NoBuyZone. Tüm hakları saklıdır.</p>
      <p>Bu bir doğrulama e-postasıdır, lütfen yanıtlamayınız.</p>
    </div>
  </div>
</body>
</html>
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
      return res.status(409).send({
        message: "Bu e-posta adresi ile kayıtlı kullanıcı bulunamadı",
      });

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
<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Şifre Sıfırlama</title>
<style>
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    margin: 0;
    padding: 0;
    background-color: #f7f7f7; /* --neutral-200 */
    color: #404040; /* --neutral-700 */
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  .email-container {
    max-width: 600px;
    margin: 40px auto;
    background-color: #ffffff; /* --neutral-100 */
    border: 1px solid #e5e5e5; /* --neutral-300 */
    border-radius: 0.5rem; /* --radius-lg */
    overflow: hidden;
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); /* --shadow-sm */
  }
  .email-body {
    padding: 30px 35px;
    line-height: 1.6;
    text-align: left;
  }
  .email-body h2 { /* Optional: if you want a greeting with user name */
    font-size: 20px;
    color: #404040; /* --neutral-700 */
    margin-top: 0;
    margin-bottom: 20px;
  }
  .email-body p {
    margin-bottom: 15px;
    font-size: 1rem; /* --font-size-md */
  }
  .email-button-container {
    text-align: center;
    margin: 30px 0;
  }
  .email-button {
    background-color: #60a5fa; /* --primary */
    color: #ffffff !important; /* --neutral-100, !important for link override */
    padding: 15px 30px;
    text-decoration: none;
    border-radius: 0.375rem; /* --radius-md */
    font-size: 1rem; /* --font-size-md */
    font-weight: bold;
    display: inline-block;
    border: none;
    cursor: pointer;
    transition: background-color 0.3s ease;
  }
  .email-button:hover {
    background-color: #3b82f6; /* --primary-dark */
  }
  .email-footer {
    text-align: center;
    padding: 20px;
    font-size: 0.875rem; /* --font-size-sm */
    color: #737373; /* --neutral-600 */
    border-top: 1px solid #e5e5e5; /* --neutral-300 */
  }
  .email-footer p {
    margin: 0;
  }

  /* Mobil uyumluluk */
  @media screen and (max-width: 600px) {
    .email-container {
      width: 100% !important;
      margin: 10px 0;
      border-radius: 0;
      border-left: none;
      border-right: none;
      box-shadow: none;
    }
    .email-body {
      padding: 20px 25px;
    }
    .email-button {
      padding: 12px 25px;
      font-size: 0.875rem; /* --font-size-sm */
    }
  }
</style>
</head>
<body>
  <div class="email-container">
    <div class="email-body">
      <p>Merhaba,</p>
      <p>Hesabınız için bir şifre sıfırlama talebi aldık. Şifrenizi değiştirmek istemediyseniz bu e-postayı görmezden gelebilirsiniz.</p>
      <p>Şifrenizi sıfırlamak için lütfen aşağıdaki butona tıklayın. Bu bağlantı 24 saat süreyle geçerlidir:</p>
      <div class="email-button-container">
        <a href="${url}" class="email-button" target="_blank">Şifreyi Sıfırla</a>
      </div>
      <p>Eğer yukarıdaki buton çalışmıyorsa, aşağıdaki bağlantıyı kopyalayıp tarayıcınızın adres çubuğuna yapıştırabilirsiniz:</p>
      <p><a href="${url}" target="_blank" style="color: #60a5fa; text-decoration: underline; word-break: break-all;">${url}</a></p> <p>Bu şifre sıfırlama talebini siz yapmadıysanız, bu e-postayı dikkate almayınız.</p>
    </div>
    <div class="email-footer">
      <p>&copy; ${new Date().getFullYear()} NoBuyZone. Tüm hakları saklıdır.</p>
      <p>Bu bir doğrulama e-postasıdır, lütfen yanıtlamayınız.</p>
    </div>
  </div>
</body>
</html>
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
      port: 465, //465 is for SSL/TLS port
      secureConnection: true, //TLS requires secureConnection to be false for port 465(ssl/tls) it should be true
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.APP_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || `"NoBuyZone" <${process.env.EMAIL_USER}>`,
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
      return res
        .status(409)
        .send({ message: "Bu kullanıcı adı zaten alınmış" });
    }

    // Update the username
    await User.findByIdAndUpdate(req.user._id, { username });

    res.status(200).send({ message: "Kullanıcı adı başarıyla güncellendi" });
  } catch (error) {
    console.error("Error updating username:", error);
    res.status(500).json({
      success: false,
      error: "Kullanıcı adı güncellenirken bir hata oluştu.",
    });
  }
});
// Update profile picture
router.patch("/api/user/profile-picture", isAuthenticated, async (req, res) => {
  try {
    const { url, publicId } = req.body; // New picture details from request body
    const userId = req.user._id;

    // Validate required fields for the new picture
    if (!url || !publicId) {
      return res.status(400).json({
        success: false,
        error: "Yeni resim URL'si ve publicId gereklidir.",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "Kullanıcı bulunamadı.",
      });
    }

    // If there's an old profile picture, attempt to delete it from Cloudinary
    if (user.profilePicture && user.profilePicture.publicId) {
      const oldPublicId = user.profilePicture.publicId;
      try {
        const fullDeleteUrl = `${req.protocol}://${req.get(
          "host"
        )}/api/delete/${oldPublicId}`;
        const deleteResponse = await fetch(fullDeleteUrl, {
          method: "DELETE",
          headers: {
            Cookie: req.headers.cookie || "", // Pass cookie for authentication to /api/delete
          },
        });

        if (!deleteResponse.ok) {
          let errorData = { error: deleteResponse.statusText };
          try {
            errorData = await deleteResponse.json();
          } catch (e) {
            /* Ignore parsing error if not JSON */
          }
          console.warn(
            `Eski profil resmi Cloudinary'den silinemedi (publicId: ${oldPublicId}): ${
              errorData.error || deleteResponse.statusText
            }. Güncelleme devam ediyor.`
          );
        }
      } catch (deleteError) {
        console.warn(
          `Eski profil resmi Cloudinary'den silinirken bir hata oluştu (publicId: ${oldPublicId}): ${deleteError.message}. Güncelleme devam ediyor.`
        );
      }
    }

    // Update user's profile picture in the database with the new one
    await User.findByIdAndUpdate(userId, {
      profilePicture: {
        url,
        publicId,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Profil resmi başarıyla güncellendi.",
      newProfilePicture: { url, publicId },
    });
  } catch (error) {
    console.error("Profil resmi güncellenirken hata oluştu:", error);
    return res.status(500).json({
      success: false,
      error:
        "Profil resmi güncellenirken bir sunucu hatası oluştu: " +
        error.message,
    });
  }
});

// Delete profile picture
router.delete(
  "/api/user/profile-picture",
  isAuthenticated,
  async (req, res) => {
    try {
      const userId = req.user._id;
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: "Kullanıcı bulunamadı.",
        });
      }

      if (!user.profilePicture || !user.profilePicture.publicId) {
        return res.status(400).json({
          success: false,
          error: "Silinecek aktif bir profil resmi bulunmuyor.",
        });
      }

      const publicIdToDelete = user.profilePicture.publicId;

      // Attempt to delete the image from Cloudinary
      try {
        const fullDeleteUrl = `${req.protocol}://${req.get(
          "host"
        )}/api/delete/${publicIdToDelete}`;
        const deleteResponse = await fetch(fullDeleteUrl, {
          method: "DELETE",
          headers: {
            Cookie: req.headers.cookie || "", // Pass cookie for authentication
          },
        });

        if (!deleteResponse.ok) {
          let errorData = { error: deleteResponse.statusText };
          try {
            errorData = await deleteResponse.json();
          } catch (e) {
            /* Ignore parsing error */
          }
          console.error(
            `Profil resmi Cloudinary'den silinemedi (publicId: ${publicIdToDelete}): ${
              errorData.error || deleteResponse.statusText
            }. Veritabanından yine de kaldırılacak.`
          );
          // Even if Cloudinary deletion fails, proceed to remove from DB
        }
      } catch (deleteError) {
        console.error(
          `Profil resmi Cloudinary'den silinirken bir hata oluştu (publicId: ${publicIdToDelete}): ${deleteError.message}. Veritabanından yine de kaldırılacak.`
        );
        // Even if Cloudinary deletion fails, proceed to remove from DB
      }

      // Remove profile picture from the database
      await User.findByIdAndUpdate(userId, {
        $unset: { profilePicture: "" }, // Removes the profilePicture field from the document
      });

      return res.status(200).json({
        success: true,
        message: "Profil resmi başarıyla silindi.",
      });
    } catch (error) {
      console.error("Error deleting profile picture:", error);
      return res.status(500).json({
        success: false,
        error: "Profil resmi silinirken bir hata oluştu: " + error.message,
      });
    }
  }
);

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
      status: "active",
    }).select("_id");

    // Get all user's drafts
    const drafts = await Post.find({
      createdBy: userId,
      status: "draft",
    }).select("_id");

    // Delete each post using the post delete API to ensure Cloudinary images are deleted
    for (const post of posts) {
      try {
        const deleteUrl = `${protocol}://${host}/api/posts/${post._id}`;
        await fetch(deleteUrl, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookies,
          },
          credentials: "same-origin",
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
            Cookie: cookies,
          },
          credentials: "same-origin",
        });
      } catch (draftError) {
        console.error(`Error deleting draft ${draft._id}:`, draftError);
        // Continue with other deletions even if one fails
      }
    }

    // 2. Find all messages where this user is a participant
    const Message = mongoose.model("Message");
    await Message.deleteMany({
      "users.user": userId,
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
      message: "Hesabınız ve ilgili tüm verileriniz başarıyla silindi",
    });
  } catch (error) {
    console.error("Error deleting account:", error);
    return res.status(500).json({
      success: false,
      message: "Hesap silinirken bir hata oluştu: " + error.message,
    });
  }
});

export default router;
