export interface PermissionsService {
  CheckPermissions: (user: User, permission: string) => Promise<boolean>;
}

export type User = {
  id: string;
  permissions: string[];
};

export const MockPermissions: PermissionsService = {
  CheckPermissions: async (user, permission) =>
    user.permissions.includes(permission),
};
