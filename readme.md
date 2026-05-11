Start Zookeeper:- bin\windows\zookeeper-server-start.bat config\zookeeper.properties 
Start Kafka Broker:- bin\windows\kafka-server-start.bat config\server.properties
Verify Kafka is Running:- bin\windows\kafka-topics.bat --list --bootstrap-server localhost:9092
Create a Test Topic:- bin\windows\kafka-topics.bat --create --topic test-topic --bootstrap-server localhost:9092 --partitions 1 --replication-factor 1
Start Producer:- bin\windows\kafka-console-producer.bat --topic test-topic --bootstrap-server localhost:9092
Start Consumer:- bin\windows\kafka-console-consumer.bat --topic test-topic --from-beginning --bootstrap-server localhost:9092