/* Czy dane pochodzą teraz z konta w bazie. Osobny moduł, żeby magazyn
   stanu i obsługa sesji nie importowały siebie nawzajem. */

let cloud = false;

export const isCloud = () => cloud;

export function setCloud(value: boolean) {
  cloud = value;
}
