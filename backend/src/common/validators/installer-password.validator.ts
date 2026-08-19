/**
 * DirectAdmin (skrzynka pocztowa instalatora, patrz DirectAdminService)
 * wymaga hasła: min. 10 znaków, zawierającego przynajmniej jedną cyfrę,
 * jedną wielką i jedną małą literę. Sprawdzamy to PRZED zapisem hasła
 * w aplikacji (nie tylko przy próbie synchronizacji z DirectAdmin), żeby
 * admin/instalator od razu dostał czytelny komunikat, zamiast cichej
 * porażki tworzenia/aktualizacji skrzynki w tle.
 */
export function validateInstallerPassword(password: string): string | null {
  if (password.length < 10) {
    return 'Hasło instalatora musi mieć min. 10 znaków (wymóg konta pocztowego)';
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Hasło instalatora musi zawierać małą literę, wielką literę i cyfrę (wymóg konta pocztowego)';
  }
  return null;
}
