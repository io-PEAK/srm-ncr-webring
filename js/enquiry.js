document.getElementById('enquiryForm').addEventListener('submit', (event) => {
  event.preventDefault();

  const data = {
    name: document.getElementById('name').value,
    email: document.getElementById('email').value,
    type: document.getElementById('type').value,
    details: document.getElementById('details').value,
  };

  fetch('https://backend.srmncrwebring.workers.dev/enquiry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
    .then(response => response.json())
    .then(result => {
      document.getElementById('output').textContent = result.success
        ? 'Submitted! ' + result.issueUrl
        : 'Error: ' + result.error;
    })
    .catch(error => {
      document.getElementById('output').textContent = 'Error: ' + error.message;
    });
});