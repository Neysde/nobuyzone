import bcrypt from "bcryptjs"; //check for bcryptjs if this is working or not. If not, change it back to bcrypt or rewrite the encrypt code.

const saltRounds = parseInt(process.env.PASSWORD_SALT_ROUNDS);

export const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(saltRounds);
  return await bcrypt.hash(password, salt);
}; //we need plain password and salt round to hash how much time needed for hash so more round you want that's gonna increase complexity. (recommended 10 rounds)

export const comparePassword = async (
  plain,
  hashed //this is for comparing passwords(bcrypt has a built-in func for that.)
) => await bcrypt.compare(plain, hashed);
