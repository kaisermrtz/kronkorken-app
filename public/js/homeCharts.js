//Farbe
var color = Chart.helpers.color;
function getColorForIndex(index){
  var colorArray = [
    color(window.chartColors.blue),
    color(window.chartColors.red),
    color(window.chartColors.orange),
    color(window.chartColors.green),
    color(window.chartColors.yellow),
    color(window.chartColors.purple),
    color(window.chartColors.grey)
  ];
  var randomVal = index;
  if(index == undefined){
    var randomVal = Math.floor(Math.random() * 7);
  }
  return colorArray[randomVal];
}

/**
  Top 5 Länder Balkendiagramm
*/
var countryCountFirst5 = countryCount.slice(0,5);
var myDatasets = new Array();
for(var i=0; i<countryCountFirst5.length; i++){
  var dataset = {
    label: 'A',
    backgroundColor: getColorForIndex(i).alpha(0.7).rgbString(),
    borderColor: getColorForIndex(i).alpha(0.7).rgbString(),
    borderWidth: 1,
    data: [
        444
    ]
  }
  dataset.label = countryCountFirst5[i]._id;
  dataset.data[0] = countryCountFirst5[i].count;
  myDatasets.push(dataset);
}

var barChartData = {
    labels: ["Land"],
    datasets: myDatasets
};

/**
  Diagramm zum Verlauf der letzten Monate
*/
var myDatasetsHistory = [{
  label: 'Eingetragene Kronkorken',
  backgroundColor: 'transparent',
  borderColor: window.chartColors.blue,
  pointRadius: 8,
  pointBackgroundColor: window.chartColors.blue,
  data: [
      12
  ]
}];
//aufaddieren
for(var i=0; i<historyCountArray.length; i++){
  if(i == 0){
    myDatasetsHistory[0].data[i] = historyCountArray[i].count;
  }else{
    myDatasetsHistory[0].data[i] = myDatasetsHistory[0].data[i-1] + historyCountArray[i].count;
  }
}
//bescheiden auf 6
myDatasetsHistory[0].data = myDatasetsHistory[0].data.slice(-6);
historyCountArray = historyCountArray.slice(-6);

//Entwicklung letzte Monate einfügen
var lineChartData = {
    labels: ["Monat"],
    fill: false,
    datasets: myDatasetsHistory
};

for(var i=0; i<historyCountArray.length; i++){
  lineChartData.labels[i] = historyCountArray[i]._id.month + "." + historyCountArray[i]._id.year
}

/**
  Top 5 Marken Balkendiagramm
*/

//Top 5 Marken Balkendiagramm Daten vorbereiten
var myDatasetsBrandCount = new Array();
for(var i=0; i<brandCount.length; i++){
  var dataset = {
    label: 'A',
    backgroundColor: getColorForIndex(i).alpha(0.7).rgbString(),
    borderColor: getColorForIndex(i).alpha(0.7).rgbString(),
    borderWidth: 1,
    data: [
        444
    ]
  }
  dataset.label = brandCount[i]._id;
  dataset.data[0] = brandCount[i].count;
  myDatasetsBrandCount.push(dataset);
}

//Top 5 Marken Balkendiagramm Daten einfügen
var barChartDataBrandCount = {
    labels: ["Marke"],
    datasets: myDatasetsBrandCount
};

/**
  Kuchendiagramm typeOfDrink
*/

var typePieChartData = {
  datasets: [{
    backgroundColor: [],
    borderColor: [],
    hoverBackgroundColor: [],
    data: []
  }],
  labels: []
};
for(var i=0; i<typeCount.length; i++){
  typePieChartData.datasets[0].data[i] = typeCount[i].count;
  var myColor = getColorForIndex(i).alpha(0.7).rgbString();
  typePieChartData.datasets[0].backgroundColor[i] = myColor;
  typePieChartData.datasets[0].borderColor[i] = myColor;
  typePieChartData.labels[i] = typeCount[i]._id;
}

/**
  Onload Funktion
*/

//Onload Funktion
window.onload = function() {
  //Top 5 Länder
  ctx = document.getElementById("chart").getContext("2d");
  window.myBar = new Chart(ctx, {
      type: 'bar',
      data: barChartData,
      options: {
          responsive: true,
          legend: {
              position: 'top',
          },
          title: {
              display: true,
              text: 'Top 5 Länder'
          },
          scales: {
            yAxes: [{
              ticks: {
                beginAtZero: true
              }
            }]
          }
      }
    });
    //Letzte Monate
    ctx1 = document.getElementById("chartHistory").getContext("2d");
    window.myBar = new Chart(ctx1, {
        type: 'line',
        data: lineChartData,
        options: {
            responsive: true,
            legend: {
                display: false
            },
            title: {
                display: true,
                text: 'Entwicklung der letzten Monate'
            },
            scales: {
              yAxes: [{
                ticks: {
                  beginAtZero: false
                }
              }]
            }
        }
      });
    //Top 5 Marken
    ctx2 = document.getElementById("chartBrand").getContext("2d");
    window.myBar = new Chart(ctx2, {
        type: 'bar',
        data: barChartDataBrandCount,
        options: {
            responsive: true,
            legend: {
                position: 'top',
            },
            title: {
                display: true,
                text: 'Top 5 Marken'
            },
            scales: {
              yAxes: [{
                ticks: {
                  beginAtZero: true
                }
              }]
            }
        }
  });
  var ctx3 = document.getElementById("typeOfDrinkChart").getContext("2d");
  var typeOfDrinkPieChart = new Chart(ctx3, {
    type: 'pie',
    data: typePieChartData,
    options: {
      responsive: true,
      title: {
        display: true,
        text: 'Getränkesorten'
      }
    }
  });
}
