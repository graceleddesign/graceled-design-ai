declare module "bcryptjs" {
  export function hash(password: string, salt: number | string): Promise<string>;
  export function compare(password: string, hash: string): Promise<boolean>;

  const bcrypt: {
    hash: typeof hash;
    compare: typeof compare;
  };

  export default bcrypt;
}
