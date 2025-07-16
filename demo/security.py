import requests, time

def check(cookie):
    base_url = "https://odgp7mptod.execute-api.eu-west-1.amazonaws.com/dev/"
    paths = ["transactions", "balance", "requests"]
    headers = {
        "Authorization": "Bearer " + cookie,
    }
    results = {}
    
    for path in paths:
        url = base_url + path
        try:
            response = requests.get(url, headers=headers)
            if response.status_code == 200:
                results[path] = response.json()
            else:
                results[path] = f"Error: {response.status_code}"
        except requests.RequestException as e:
            results[path] = f"Request failed: {str(e)}"
    return results

for path, result in check("eyJraWQiOiI3WmN0eDZmRUhHU0xKUjZrcUxtSHlmQ01hcndCQnFidVZCWTFIUk9qSUtFPSIsImFsZyI6IlJTMjU2In0.eyJzdWIiOiIwMjY1MzRlNC1iMDIxLTcwZTMtODM4ZS0yZmI4MzMwYmU2Y2YiLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiaXNzIjoiaHR0cHM6XC9cL2NvZ25pdG8taWRwLmV1LXdlc3QtMS5hbWF6b25hd3MuY29tXC9ldS13ZXN0LTFfRktkb041cVJJIiwiY29nbml0bzp1c2VybmFtZSI6IjAyNjUzNGU0LWIwMjEtNzBlMy04MzhlLTJmYjgzMzBiZTZjZiIsInByZWZlcnJlZF91c2VybmFtZSI6Ik1hc3NpbWlsaWFubyIsIm9yaWdpbl9qdGkiOiIwOTViM2ZlZC00NWZkLTRjYTAtOWZmNy0wYTkyYTE5MmVjNjciLCJhdWQiOiI0NmdlOG1qcG43ZDFjZmw1dWxqdWk4NWZsZyIsImV2ZW50X2lkIjoiZTc0NjhhYzAtMjk3Ni00M2NhLWJkNjEtM2RjNjZiZTBlZjNlIiwidG9rZW5fdXNlIjoiaWQiLCJhdXRoX3RpbWUiOjE3NTI1ODg1MzgsImV4cCI6MTc1MjU5NjEyNiwiaWF0IjoxNzUyNTkyNTI2LCJqdGkiOiJjYmNhMzlmZC1iZWIxLTQ0MTgtYjVlYi1lMDYyYzYzNGY2NjciLCJlbWFpbCI6Im1hc3Npa2FwcGFydWNjaWFAaWNsb3VkLmNvbSJ9.pYABKVh02dlB8Ts2esXKBYTG10GJp6a7xFLUdfKplAKX7zbWV2zZMVTonuUfS9FJARPllhW9KeBv4vXI3HXK8jWz4Xqw8LdOs2NvBJbphAnsF69WwanlpaRuFPZKRR9v_IXArErJc0WqR_jvHBg3JQOE_IxYjckJ9MnTTBH_nvGip-R7gtqlCkq_SseAMb_aCRlvLq5bKfb1s3bLzXeUoMZDgv5sOQGetZdinTKHx0fKgACfWMf1hHOEC-l8vo3ZF3WhRIBm7SZ2DRBPlAF79CZa87SjVN1tlSw8GrFH9flg1SHe5sNRacOICOwLWEBSaUE8FHpgLGeqA6AxlWrAZg").items():
    print(f"{path}: {result}")

time.sleep(1) 

print("\n\nCancello il cookie...\n\n")

time.sleep(1) 

for path, result in check("").items():
    print(f"{path}: {result}")
