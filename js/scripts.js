fetch('../data/members.json')
 .then(response => response.json())
    .then(members => {
        const tbody = document.getElementById('memberTableBody');
        members.forEach(member => {
            const row = document.createElement('tr');
            row.innerHTML = `
        <td>${member.name}</td>
        <td>${member.program}</td>
        <td><a href="${member.website}">${member.website}</a></td>
        `;
       tbody.appendChild(row);
        });
    });