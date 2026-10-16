/* Static coursework demos: no request, account creation or stored form values. */
(function () {
  'use strict';
  var forms = document.querySelectorAll('form');
  Array.prototype.forEach.call(forms, function (form) {
    var result = document.getElementById('demo-result');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (result) { result.textContent = 'Demo complete. Your fields passed the browser checks. No information was sent and no account was created.'; }
    });
    form.addEventListener('reset', function () {
      if (result) { result.textContent = ''; }
    });
    form.addEventListener('input', function () {
      if (result) { result.textContent = ''; }
    });
  });
}());
