from pymongo import MongoClient
from pymongo.server_api import ServerApi

uri = "mongodb+srv://mohitharjani79_db_user:MwCbnIQXIPR9YUO0@cluster0.ympqrth.mongodb.net/?appName=Cluster0"

client = MongoClient(uri, server_api=ServerApi("1"))

print(client.admin.command("ping"))