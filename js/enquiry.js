(function () {
  'use strict';

  var output = document.getElementById('output');
  var form = document.getElementById('enquiryForm');
  var submitBtn = document.getElementById('enquirySubmit');

  // Preselect request type from ?type=...
  var params = new URLSearchParams(window.location.search);
  var typeParam = params.get('type');
  var typeEl = document.getElementById('type');
  if (typeParam && typeEl) {
    for (var i = 0; i < typeEl.options.length; i++) {
      if (typeEl.options[i].value === typeParam) {
        typeEl.selectedIndex = i;
        break;
      }
    }
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var data = {
      name: document.getElementById('name').value,
      email: document.getElementById('email').value,
      type: typeEl.value,
      details: document.getElementById('details').value,
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    fetch('https://backend.srmncrwebring.workers.dev/enquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
      .then(function (response) {
        return response.json();
      })
      .then(function (result) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit request';
        if (result.success) {
          showStatus('Submitted! ' + result.issueUrl, false);
        } else {
          showStatus('Error: ' + (result.error || 'Something went wrong.'), true);
        }
      })
      .catch(function (error) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit request';
        showStatus('Network error: ' + error.message, true);
      });
  });

  function showStatus(message, isError) {
    output.textContent = message;
    output.className = 'join-status is-visible ' + (isError ? 'is-error' : 'is-success');
  }
})();
