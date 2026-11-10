// Sole public barrel export for feature 'profile' (Hard Invariant 1)
export {
  loginWithCredentials,
  useLoginMutation,
  type LoginApiResult,
} from './api/auth.api';

export {
  getMyProfile,
  patchMyUiPreferences,
  PROFILE_QUERY_KEY,
  updateMyProfile,
  useMyProfileQuery,
  useUpdateProfileMutation,
  useChangePasswordMutation,
  type JoinedUserProfile,
} from './api/profile.api';

export { LoginPage } from './components/login-page';
export { ProfilePage } from './components/profile-page';
