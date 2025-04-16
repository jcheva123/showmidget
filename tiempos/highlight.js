document.addEventListener('DOMContentLoaded', () => {
    // Function to highlight a specific row
    const highlightRow = (row) => {
        row.classList.add('updated-race');
        setTimeout(() => {
            row.classList.remove('updated-race');
        }, 3000); // Matches the CSS animation duration (3s)
    };

    // Function to add a new race result (for simulation)
    const addNewRaceResult = (tbody) => {
        const newRow = document.createElement('tr');
        const position = tbody.querySelectorAll('tr').length + 1;
        newRow.innerHTML = `
            <td>${position}</td>
            <td>${Math.floor(Math.random() * 100)}</td>
            <td>Piloto ${position}</td>
            <td>1:${30 + Math.random() * 5.toFixed(3)}</td>
            <td>+${(Math.random() * 1).toFixed(3)}</td>
            <td>10</td>
            <td>-</td>
        `;
        tbody.appendChild(newRow);
        highlightRow(newRow);
    };

    // Simulate race updates
    const simulateRaceUpdate = () => {
        const tbody = document.querySelector('#results tbody');
        if (!tbody) {
            console.error('Results table body not found');
            return;
        }

        // 50% chance to add a new row, 50% to highlight an existing one
        if (Math.random() > 0.5 || tbody.querySelectorAll('tr').length === 0) {
            addNewRaceResult(tbody);
        } else {
            const rows = tbody.querySelectorAll('tr');
            const randomRow = rows[Math.floor(Math.random() * rows.length)];
            highlightRow(randomRow);
        }
    };

    // Simulate updates every 8 seconds (more frequent for testing)
    setInterval(simulateRaceUpdate, 8000);

    // Initial update after 1 second to ensure table is loaded
    setTimeout(simulateRaceUpdate, 1000);
});

// Example function to integrate with actual data (uncomment and customize)
/*
function fetchRaceUpdates() {
    fetch('your-api-endpoint')
        .then(response => response.json())
        .then(data => {
            const tbody = document.querySelector('#results tbody');
            if (!tbody) {
                console.error('Results table body not found');
                return;
            }
            data.forEach(result => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${result.position}</td>
                    <td>${result.number}</td>
                    <td>${result.driver}</td>
                    <td>${result.time}</td>
                    <td>${result.difference}</td>
                    <td>${result.laps}</td>
                    <td>${result.penalty || '-'}</td>
                `;
                tbody.appendChild(row);
                highlightRow(row);
            });
        })
        .catch(error => console.error('Error fetching race updates:', error));
}
*/
