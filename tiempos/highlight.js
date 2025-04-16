document.addEventListener('DOMContentLoaded', () => {
    // Function to highlight a specific row
    const highlightRow = (row) => {
        row.classList.add('updated-race');
        setTimeout(() => {
            row.classList.remove('updated-race');
        }, 2000); // Matches the CSS animation duration
    };

    // Simulate adding a new race result (replace with actual data logic)
    const simulateRaceUpdate = () => {
        const tbody = document.querySelector('#results tbody');
        if (!tbody) {
            console.error('Results table body not found');
            return;
        }

        const rows = tbody.querySelectorAll('tr');
        if (rows.length > 0) {
            // Randomly select a row to highlight (for demo purposes)
            const randomRow = rows[Math.floor(Math.random() * rows.length)];
            highlightRow(randomRow);
        } else {
            // If no rows exist, create a sample row (for demo purposes)
            const newRow = document.createElement('tr');
            newRow.innerHTML = `
                <td>1</td>
                <td>99</td>
                <td>Juan Pérez</td>
                <td>1:30.456</td>
                <td>0.000</td>
                <td>10</td>
                <td>-</td>
            `;
            tbody.appendChild(newRow);
            highlightRow(newRow);
        }
    };

    // Simulate periodic updates every 10 seconds
    setInterval(simulateRaceUpdate, 10000);

    // Initial call to test highlighting
    simulateRaceUpdate();
});
