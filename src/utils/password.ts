import bcrypt from "bcryptjs";

export const hashPassword = (password: string) => {
  return bcrypt.hashSync(password, 12);
};

export const verifyPassword = (password: string, hash: string) => {
  return bcrypt.compareSync(password, hash);
};
