export { RbacUsersPage } from './components/rbac-users-page';
export {
  PermissionsDrawer,
  type PermissionsDrawerProps,
} from './components/permissions-drawer';
export {
  CreateUserDialog,
  type CreateUserDialogProps,
} from './components/create-user-dialog';
export {
  useUsersQuery,
  useCreateUserMutation,
  useUpdatePermissionsMutation,
  type UserRecord,
  type UserListResponse,
} from './api/rbac.api';
