#!/bin/bash

MEDIUM_IP="54.221.22.231"
NANO_IP="3.80.47.223"

# Buat direktori untuk hasil
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RESULT_DIR="load_test_results_$TIMESTAMP"
mkdir -p $RESULT_DIR

# Fungsi untuk monitoring metrics dari pod medium
monitor_medium() {
  local duration=$1
  local interval=5  # interval dalam detik
  local iterations=$((duration * 60 / interval))
  local output_file="$RESULT_DIR/metrics_medium_$TIMESTAMP.csv"
  
  echo "Monitoring Medium dimulai, menyimpan data ke $output_file"
  echo "Timestamp,Deployment,Replicas,CPU(%),Memory(Mi)" > $output_file
  
  for ((i=1; i<=iterations; i++)); do
    current_time=$(date +"%Y-%m-%d %H:%M:%S")
    
    # Ambil data deployment medium
    med_pods=$(kubectl get pods -n authentication-app -l app=authentication,node=medium --no-headers | wc -l)
    med_cpu=$(kubectl top pods -n authentication-app -l app=authentication,node=medium --no-headers 2>/dev/null | awk '{sum+=$2} END {print sum}')
    [ -z "$med_cpu" ] && med_cpu=0
    med_mem=$(kubectl top pods -n authentication-app -l app=authentication,node=medium --no-headers 2>/dev/null | awk '{sum+=$3} END {print sum}')
    [ -z "$med_mem" ] && med_mem=0
    
    # Log data
    echo "$current_time,authentication-medium,$med_pods,$med_cpu,$med_mem" >> $output_file
    
    # Print status (setiap 1 menit)
    if [ $((i % 12)) -eq 0 ]; then
      echo "Monitoring Medium berjalan: $((i * interval / 60)) menit dari $duration menit"
    fi
    
    sleep $interval
  done
  
  echo "Monitoring Medium selesai. Data disimpan ke $output_file"
}

# Fungsi untuk monitoring metrics dari pod nano
monitor_nano() {
  local duration=$1
  local interval=5  # interval dalam detik
  local iterations=$((duration * 60 / interval))
  local output_file="$RESULT_DIR/metrics_nano_$TIMESTAMP.csv"
  
  echo "Monitoring Nano dimulai, menyimpan data ke $output_file"
  echo "Timestamp,Deployment,Replicas,CPU(%),Memory(Mi)" > $output_file
  
  for ((i=1; i<=iterations; i++)); do
    current_time=$(date +"%Y-%m-%d %H:%M:%S")
    
    # Ambil data deployment nano
    nano_pods=$(kubectl get pods -n authentication-app -l app=authentication,node=nano --no-headers | wc -l)
    nano_cpu=$(kubectl top pods -n authentication-app -l app=authentication,node=nano --no-headers 2>/dev/null | awk '{sum+=$2} END {print sum}')
    [ -z "$nano_cpu" ] && nano_cpu=0
    nano_mem=$(kubectl top pods -n authentication-app -l app=authentication,node=nano --no-headers 2>/dev/null | awk '{sum+=$3} END {print sum}')
    [ -z "$nano_mem" ] && nano_mem=0
    
    # Log data
    echo "$current_time,authentication-nano,$nano_pods,$nano_cpu,$nano_mem" >> $output_file
    
    # Print status (setiap 1 menit)
    if [ $((i % 12)) -eq 0 ]; then
      echo "Monitoring Nano berjalan: $((i * interval / 60)) menit dari $duration menit"
    fi
    
    sleep $interval
  done
  
  echo "Monitoring Nano selesai. Data disimpan ke $output_file"
}

# Fungsi untuk menjalankan k6 load test pada Medium
run_medium_test() {
  echo "Menjalankan load test pada Medium Worker..."
  
  # Buat script load test untuk medium
  cat > $RESULT_DIR/load-test-medium.js << EOF
import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 30 },  // Ramp-up ke 30 users dalam 1 menit
    { duration: '3m', target: 100 }, // Pertahankan 100 users selama 3 menit
    { duration: '1m', target: 0 },   // Ramp-down ke 0 dalam 1 menit
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  const response = http.get('http://${MEDIUM_IP}:30001/health');
  
  check(response, {
    'is status 200': (r) => r.status === 200,
  });
  
  sleep(1);
}
EOF

  # Jalankan test medium
  k6 run $RESULT_DIR/load-test-medium.js --summary-export=$RESULT_DIR/k6-medium-summary.json
}

# Fungsi untuk menjalankan k6 load test pada Nano
run_nano_test() {
  echo "Menjalankan load test pada Nano Worker..."
  
  # Buat script load test untuk nano
  cat > $RESULT_DIR/load-test-nano.js << EOF
import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 30 },  // Ramp-up ke 30 users dalam 1 menit
    { duration: '3m', target: 100 }, // Pertahankan 100 users selama 3 menit
    { duration: '1m', target: 0 },   // Ramp-down ke 0 dalam 1 menit
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  const response = http.get('http://${NANO_IP}:30002/health');
  
  check(response, {
    'is status 200': (r) => r.status === 200,
  });
  
  sleep(1);
}
EOF

  # Jalankan test nano
  k6 run $RESULT_DIR/load-test-nano.js --summary-export=$RESULT_DIR/k6-nano-summary.json
}

# Fungsi untuk menganalisis hasil Medium
analyze_medium_results() {
  echo "Menganalisis hasil Medium..."
  
  # Buat file ringkasan
  local summary_file="$RESULT_DIR/medium_summary.txt"
  
  # Ringkasan jumlah pod
  echo "Statistik Medium Deployment:" > $summary_file
  echo "Jumlah Replicas:" >> $summary_file
  awk -F',' 'NR>1 {print $3}' $RESULT_DIR/metrics_medium_$TIMESTAMP.csv | sort -n | uniq -c | sort -nrk2 >> $summary_file
  
  # Max CPU dan Memory
  echo "" >> $summary_file
  echo "Penggunaan CPU maksimum:" >> $summary_file
  echo "$(awk -F',' 'NR>1 {print $4}' $RESULT_DIR/metrics_medium_$TIMESTAMP.csv | sort -n | tail -1)%" >> $summary_file
  
  echo "" >> $summary_file
  echo "Penggunaan Memory maksimum:" >> $summary_file
  echo "$(awk -F',' 'NR>1 {print $5}' $RESULT_DIR/metrics_medium_$TIMESTAMP.csv | sort -n | tail -1) Mi" >> $summary_file
  
  # Print ringkasan
  echo "" 
  echo "========== RINGKASAN HASIL MEDIUM =========="
  cat $summary_file
  echo "==========================================="
}

# Fungsi untuk menganalisis hasil Nano
analyze_nano_results() {
  echo "Menganalisis hasil Nano..."
  
  # Buat file ringkasan
  local summary_file="$RESULT_DIR/nano_summary.txt"
  
  # Ringkasan jumlah pod
  echo "Statistik Nano Deployment:" > $summary_file
  echo "Jumlah Replicas:" >> $summary_file
  awk -F',' 'NR>1 {print $3}' $RESULT_DIR/metrics_nano_$TIMESTAMP.csv | sort -n | uniq -c | sort -nrk2 >> $summary_file
  
  # Max CPU dan Memory
  echo "" >> $summary_file
  echo "Penggunaan CPU maksimum:" >> $summary_file
  echo "$(awk -F',' 'NR>1 {print $4}' $RESULT_DIR/metrics_nano_$TIMESTAMP.csv | sort -n | tail -1)%" >> $summary_file
  
  echo "" >> $summary_file
  echo "Penggunaan Memory maksimum:" >> $summary_file
  echo "$(awk -F',' 'NR>1 {print $5}' $RESULT_DIR/metrics_nano_$TIMESTAMP.csv | sort -n | tail -1) Mi" >> $summary_file
  
  # Print ringkasan
  echo "" 
  echo "========== RINGKASAN HASIL NANO =========="
  cat $summary_file
  echo "========================================="
}

# Menu pilihan test
echo "============================================="
echo "   LOAD TEST DAN MONITORING K3S CLUSTER     "
echo "============================================="
echo "Pilih jenis test yang akan dijalankan:"
echo "1. Test Node Medium saja"
echo "2. Test Node Nano saja"
echo "3. Test keduanya (berurutan)"
echo "4. Keluar"
echo ""

read -p "Pilihan Anda [1-4]: " test_option

# Eksekusi test berdasarkan pilihan
case $test_option in
  1) # Test Medium
    echo "Menjalankan test untuk Node Medium (total durasi ~5 menit)"
    echo "Medium Worker IP: $MEDIUM_IP:30001"
    
    # Jalankan monitoring medium di background
    monitor_medium 5 &
    MONITOR_PID=$!
    
    # Jalankan load test medium
    run_medium_test
    
    # Tunggu monitoring selesai
    wait $MONITOR_PID
    
    # Analisis hasil medium
    analyze_medium_results
    ;;
    
  2) # Test Nano
    echo "Menjalankan test untuk Node Nano (total durasi ~5 menit)"
    echo "Nano Worker IP: $NANO_IP:30002"
    
    # Jalankan monitoring nano di background
    monitor_nano 5 &
    MONITOR_PID=$!
    
    # Jalankan load test nano
    run_nano_test
    
    # Tunggu monitoring selesai
    wait $MONITOR_PID
    
    # Analisis hasil nano
    analyze_nano_results
    ;;
    
  3) # Test keduanya berurutan
    echo "Menjalankan test untuk Node Medium dan Nano secara berurutan"
    
    # Test Medium
    echo "Menjalankan test Node Medium..."
    echo "Medium Worker IP: $MEDIUM_IP:30001"
    monitor_medium 5 &
    MONITOR_MEDIUM_PID=$!
    run_medium_test
    wait $MONITOR_MEDIUM_PID
    analyze_medium_results
    
    echo "Menunggu 30 detik sebelum menjalankan test Nano..."
    sleep 30
    
    # Test Nano
    echo "Menjalankan test Node Nano..."
    echo "Nano Worker IP: $NANO_IP:30002"
    monitor_nano 5 &
    MONITOR_NANO_PID=$!
    run_nano_test
    wait $MONITOR_NANO_PID
    analyze_nano_results
    ;;
    
  4) # Keluar
    echo "Keluar dari program"
    exit 0
    ;;
    
  *) # Pilihan tidak valid
    echo "Pilihan tidak valid"
    exit 1
    ;;
esac

echo "Semua test dan monitoring selesai!"
echo "Semua data tersimpan di direktori: $RESULT_DIR"
